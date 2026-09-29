import type { Point } from './canvasGeometry';

/** Crossings shallower than this (the sine of the angle between the two
 *  segments) are ignored: two lines that nearly run alongside each other don't
 *  read as one hopping the other, and a bump there would smear along the line. */
const MIN_CROSSING_SINE = 0.3;

interface Segment {
  a: Point;
  b: Point;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function segmentsOf(points: readonly Point[]): Segment[] {
  return points
    .slice(1)
    .map((b, i) => ({ a: points[i], b }))
    .filter(({ a, b }) => a.x !== b.x || a.y !== b.y);
}

function boundsOf(points: readonly Point[]): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/** Where two segments properly cross (strictly inside both, not just meeting
 *  at an end), or null — including for near-parallel pairs. */
function crossingPoint(s1: Segment, s2: Segment): Point | null {
  const d1 = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y };
  const d2 = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y };
  const denominator = d1.x * d2.y - d1.y * d2.x;
  const sine = Math.abs(denominator) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y));
  if (sine < MIN_CROSSING_SINE) return null;

  const between = { x: s2.a.x - s1.a.x, y: s2.a.y - s1.a.y };
  const t = (between.x * d2.y - between.y * d2.x) / denominator;
  const u = (between.x * d1.y - between.y * d1.x) / denominator;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: s1.a.x + d1.x * t, y: s1.a.y + d1.y * t };
}

/**
 * Finds every point where two different arrows' routes cross, and gives the
 * bump ("hop") to whichever of the pair has the lexicographically later id —
 * deterministic regardless of iteration order, and exactly one of the two
 * ever hops at a given crossing, never both or neither. Returns each hopping
 * arrow's hop points; `arrowPath.ts` draws them.
 */
export function findArrowCrossings(routes: ReadonlyMap<string, readonly Point[]>): Map<string, Point[]> {
  const prepared = [...routes].map(([id, points]) => ({ id, segments: segmentsOf(points), bounds: boundsOf(points) }));
  const hopsByArrowId = new Map<string, Point[]>();

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i];
      const b = prepared[j];
      if (!boundsOverlap(a.bounds, b.bounds)) continue;
      const hoppingId = a.id > b.id ? a.id : b.id;

      for (const s1 of a.segments) {
        for (const s2 of b.segments) {
          const crossing = crossingPoint(s1, s2);
          if (!crossing) continue;
          hopsByArrowId.set(hoppingId, [...(hopsByArrowId.get(hoppingId) ?? []), crossing]);
        }
      }
    }
  }
  return hopsByArrowId;
}
