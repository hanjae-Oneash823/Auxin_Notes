import type { Point, Rect } from './canvasGeometry';
import { rectCenter } from './canvasGeometry';

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointTowards(from: Point, to: Point, dist: number): Point {
  const len = distance(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / len) * dist, y: from.y + ((to.y - from.y) / len) * dist };
}

/** The unrounded elbow polyline between two cards: exits whichever side of
 *  `from` faces `to` and enters the mirrored side of `to`, then bends once
 *  at the horizontal or vertical midpoint between them (nudged by
 *  `laneOffset`, in px — see `arrowLanes.ts`) — so an arrow travels in
 *  straight horizontal/vertical runs like a flowchart connector, rather
 *  than a free-form curve. Routes horizontal-first when the cards are
 *  farther apart on the x-axis than the y-axis (and vertical-first
 *  otherwise), which is what keeps the single bend from cutting back across
 *  either box. Exported (rather than folded into `buildArrowPath` below) so
 *  `CanvasView.tsx` can collect every arrow's raw polyline up front and run
 *  `assignArrowLanes`/`findArrowCrossings` over all of them before any one
 *  arrow's final path is built. */
export function computeArrowPolyline(from: Rect, to: Rect, laneOffset: number): Point[] {
  const fromCenter = rectCenter(from);
  const toCenter = rectCenter(to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const exitRight = dx >= 0;
    const start: Point = { x: exitRight ? from.x + from.w : from.x, y: fromCenter.y };
    const end: Point = { x: exitRight ? to.x : to.x + to.w, y: toCenter.y };
    const midX = (start.x + end.x) / 2 + laneOffset;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }

  const exitDown = dy >= 0;
  const start: Point = { x: fromCenter.x, y: exitDown ? from.y + from.h : from.y };
  const end: Point = { x: toCenter.x, y: exitDown ? to.y : to.y + to.h };
  const midY = (start.y + end.y) / 2 + laneOffset;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

export interface CrossbarShape {
  /** Which coordinate the crossbar (the middle segment, between the two
   *  bend points) holds constant: `'x'` for a vertical crossbar (a
   *  horizontal-first route), `'y'` for a horizontal one. Two crossbars can
   *  only run parallel — and so only need lane separation — when they share
   *  an axis; a vertical and a horizontal crossbar are never the "runs
   *  alongside" case `arrowLanes.ts` is for. */
  axis: 'x' | 'y';
  coord: number;
  lo: number;
  hi: number;
}

/** Extracts the crossbar's axis/coordinate/span from an already-computed
 *  polyline — used on a *lane-offset-0* polyline so `arrowLanes.ts` can
 *  compare arrows' natural, unnudged positions before any lane has been
 *  assigned. */
export function crossbarShape(points: Point[]): CrossbarShape {
  const [, bend1, bend2] = points;
  if (bend1.x === bend2.x) {
    return { axis: 'x', coord: bend1.x, lo: Math.min(bend1.y, bend2.y), hi: Math.max(bend1.y, bend2.y) };
  }
  return { axis: 'y', coord: bend1.y, lo: Math.min(bend1.x, bend2.x), hi: Math.max(bend1.x, bend2.x) };
}

const HOP_HALF_WIDTH = 6;
const HOP_HEIGHT = 8;

/** SVG commands for one small bump where this arrow's path crosses
 *  another's — a schematic-diagram "wire jump" rather than an attempt to
 *  reroute around it. The bump always deflects to a fixed side (up for a
 *  horizontal run, right for a vertical one) regardless of which way the
 *  arrow is traveling, so the jump direction reads consistently across the
 *  whole board. */
function hopBump(hop: Point, horizontal: boolean, forward: boolean): string {
  const sign = forward ? 1 : -1;
  if (horizontal) {
    const enterX = hop.x - sign * HOP_HALF_WIDTH;
    const exitX = hop.x + sign * HOP_HALF_WIDTH;
    return `L${enterX},${hop.y} Q${hop.x},${hop.y - HOP_HEIGHT} ${exitX},${hop.y}`;
  }
  const enterY = hop.y - sign * HOP_HALF_WIDTH;
  const exitY = hop.y + sign * HOP_HALF_WIDTH;
  return `L${hop.x},${enterY} Q${hop.x + HOP_HEIGHT},${hop.y} ${hop.x},${exitY}`;
}

/** `hops` that fall strictly inside the drawn `[a, b]` stretch of one
 *  straight run (post corner-rounding), in travel order — a hop that would
 *  land inside a rounded-corner's cut zone is silently dropped rather than
 *  fighting the corner arc for the same few pixels; crossings that close to
 *  a card edge are rare enough on a hand-placed board not to special-case. */
function hopsOnSegment(hops: readonly Point[], a: Point, b: Point, horizontal: boolean): Point[] {
  const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
  const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  const forward = horizontal ? b.x > a.x : b.y > a.y;
  return hops
    .filter((hop) => {
      const onLine = horizontal ? hop.y === a.y : hop.x === a.x;
      const along = horizontal ? hop.x : hop.y;
      return onLine && along > lo && along < hi;
    })
    .sort((p, q) => {
      const pv = horizontal ? p.x : p.y;
      const qv = horizontal ? q.x : q.y;
      return forward ? pv - qv : qv - pv;
    });
}

export interface ArrowRoute {
  /** SVG path `d` attribute — a rounded-corner orthogonal elbow, with a
   *  small hop bump wherever another arrow's route was found to cross it. */
  path: string;
  /** The route's middle crossbar's midpoint — reads as the path's visual
   *  center for a label better than a start/end average would once it's
   *  bent through two corners. */
  labelPoint: Point;
}

/**
 * Turns a `computeArrowPolyline` polyline into the final SVG path: rounds
 * each interior corner (back off `cornerRadius` along both adjoining
 * segments, then arc through the vertex) and splices a `hopBump` into any
 * straight run that `hops` (from `findArrowCrossings`) says another arrow
 * crosses. Assumes exactly the 4-point `[start, bend1, bend2, end]` shape
 * `computeArrowPolyline` always produces — not a general polyline-to-path
 * utility.
 */
export function buildArrowPath(points: Point[], cornerRadius: number, hops: readonly Point[]): ArrowRoute {
  const segmentCount = points.length - 1;
  const cutRadius = points.map((point, i) => {
    if (i === 0 || i === points.length - 1) return 0;
    return Math.min(cornerRadius, distance(points[i - 1], point) / 2, distance(point, points[i + 1]) / 2);
  });

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < segmentCount; i++) {
    const rawStart = points[i];
    const rawEnd = points[i + 1];
    const subStart = i === 0 ? rawStart : pointTowards(rawStart, rawEnd, cutRadius[i]);
    const subEnd = i === segmentCount - 1 ? rawEnd : pointTowards(rawEnd, rawStart, cutRadius[i + 1]);
    const horizontal = rawStart.y === rawEnd.y;
    const forward = horizontal ? subEnd.x > subStart.x : subEnd.y > subStart.y;

    for (const hop of hopsOnSegment(hops, subStart, subEnd, horizontal)) {
      d += ` ${hopBump(hop, horizontal, forward)}`;
    }
    d += ` L${subEnd.x},${subEnd.y}`;

    if (i < segmentCount - 1) {
      const corner = points[i + 1];
      const cutOut = pointTowards(corner, points[i + 2], cutRadius[i + 1]);
      d += ` Q${corner.x},${corner.y} ${cutOut.x},${cutOut.y}`;
    }
  }

  const [, bend1, bend2] = points;
  return {
    path: d,
    labelPoint: { x: (bend1.x + bend2.x) / 2, y: (bend1.y + bend2.y) / 2 },
  };
}
