import type { Point } from './canvasGeometry';

export interface ArrowRoute {
  /** SVG path `d` attribute — the route's straight runs, with each bend rounded. */
  path: string;
  /** The point halfway along the route — where an arrow's label sits. */
  labelPoint: Point;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointTowards(from: Point, to: Point, dist: number): Point {
  const len = distance(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / len) * dist, y: from.y + ((to.y - from.y) / len) * dist };
}

/** The point `fraction` of the way along the polyline, by length. */
function pointAlong(points: readonly Point[], fraction: number): Point {
  const total = points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
  let remaining = total * fraction;
  for (let i = 1; i < points.length; i++) {
    const segment = distance(points[i - 1], points[i]);
    if (remaining <= segment) return pointTowards(points[i - 1], points[i], remaining);
    remaining -= segment;
  }
  return points[points.length - 1];
}

/** Radius of a hop — a semicircle, so the bump is 2×radius wide at its base
 *  and `HOP_RADIUS` tall. */
const HOP_RADIUS = 6;
/** How far off a segment's line a hop point may sit and still count as on it. */
const ON_LINE_TOLERANCE = 0.75;

/** SVG commands for the hops that fall on the straight run `start`–`end`: for
 *  each, a line to the bump's base and a semicircular arc over the crossing.
 *  The bump always bulges toward the top of the screen (to the right, on a
 *  vertical run) whichever way the arrow is traveling, so the jump direction
 *  reads consistently across the whole board. A hop with less than a full bump
 *  of room to either end of the run — near a rounded bend, or an arrow's end —
 *  is dropped rather than fighting it for the same few pixels. */
function hopCommands(start: Point, end: Point, hops: readonly Point[]): string {
  const length = distance(start, end);
  if (length === 0) return '';
  const direction = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };

  // Bulge side: the perpendicular pointing up the screen (rightward if vertical).
  const up = { x: direction.y, y: -direction.x };
  const bulge = Math.abs(up.y) > 1e-9 ? (up.y < 0 ? up : { x: -up.x, y: -up.y }) : up.x > 0 ? up : { x: -up.x, y: -up.y };
  // SVG's y axis points down, so the arc sweeps "positive" when the bulge is
  // on the side the direction turns away from.
  const sweep = direction.x * bulge.y - direction.y * bulge.x < 0 ? 1 : 0;

  const onRun = hops
    .map((hop) => {
      const along = (hop.x - start.x) * direction.x + (hop.y - start.y) * direction.y;
      const off = Math.abs((hop.x - start.x) * direction.y - (hop.y - start.y) * direction.x);
      return { hop, along, off };
    })
    .filter(({ along, off }) => off <= ON_LINE_TOLERANCE && along > HOP_RADIUS && along < length - HOP_RADIUS)
    .sort((p, q) => p.along - q.along);

  let commands = '';
  let previousAlong = -Infinity;
  for (const { hop, along } of onRun) {
    if (along - previousAlong < HOP_RADIUS * 2) continue;
    previousAlong = along;
    const base = { x: hop.x - direction.x * HOP_RADIUS, y: hop.y - direction.y * HOP_RADIUS };
    const top = { x: hop.x + direction.x * HOP_RADIUS, y: hop.y + direction.y * HOP_RADIUS };
    commands += ` L${base.x},${base.y} A${HOP_RADIUS},${HOP_RADIUS} 0 0 ${sweep} ${top.x},${top.y}`;
  }
  return commands;
}

/**
 * Turns a route (any polyline, at any angles) into an SVG path: straight runs
 * between the points, with each interior bend rounded — back off `cornerRadius`
 * (or half the shorter neighbouring run, whichever is less) along both
 * segments, then curve through the vertex — and a small hop bump wherever
 * `hops` (from `findArrowCrossings`) says this arrow passes over another.
 */
export function buildArrowPath(route: readonly Point[], cornerRadius: number, hops: readonly Point[] = []): ArrowRoute {
  const points = route.filter((p, i) => i === 0 || p.x !== route[i - 1].x || p.y !== route[i - 1].y);
  if (points.length < 2) return { path: '', labelPoint: points[0] ?? { x: 0, y: 0 } };

  const last = points.length - 1;
  let pen = points[0];
  let d = `M${pen.x},${pen.y}`;
  for (let i = 1; i <= last; i++) {
    const isLast = i === last;
    const cut = isLast ? 0 : Math.min(cornerRadius, distance(points[i - 1], points[i]) / 2, distance(points[i], points[i + 1]) / 2);
    const end = isLast ? points[i] : pointTowards(points[i], points[i - 1], cut);
    d += `${hopCommands(pen, end, hops)} L${end.x},${end.y}`;
    if (isLast) break;
    pen = pointTowards(points[i], points[i + 1], cut);
    d += ` Q${points[i].x},${points[i].y} ${pen.x},${pen.y}`;
  }
  return { path: d, labelPoint: pointAlong(points, 0.5) };
}
