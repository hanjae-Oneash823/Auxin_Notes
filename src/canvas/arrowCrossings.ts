import type { Point } from './canvasGeometry';

interface Segment {
  a: Point;
  b: Point;
}

function toSegments(points: readonly Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) segments.push({ a: points[i], b: points[i + 1] });
  return segments;
}

function isHorizontal(segment: Segment): boolean {
  return segment.a.y === segment.b.y;
}

/** The point where a horizontal and a vertical segment genuinely cross —
 *  null for two segments of the same orientation (a parallel run isn't a
 *  "crosses on top of" case; that's what `arrowPath.ts`'s lane offset
 *  already spreads apart) or for segments that only touch at an endpoint
 *  (an arrow legitimately starting where another ends, at a shared card
 *  edge, shouldn't read as a crossing). */
function perpendicularCrossing(s1: Segment, s2: Segment): Point | null {
  if (isHorizontal(s1) === isHorizontal(s2)) return null;
  const h = isHorizontal(s1) ? s1 : s2;
  const v = isHorizontal(s1) ? s2 : s1;
  const hy = h.a.y;
  const hx0 = Math.min(h.a.x, h.b.x);
  const hx1 = Math.max(h.a.x, h.b.x);
  const vx = v.a.x;
  const vy0 = Math.min(v.a.y, v.b.y);
  const vy1 = Math.max(v.a.y, v.b.y);
  if (vx <= hx0 || vx >= hx1 || hy <= vy0 || hy >= vy1) return null;
  return { x: vx, y: hy };
}

/**
 * Finds every point where two different arrows' routed polylines
 * (`computeArrowPolyline` in `arrowPath.ts`) cross, and assigns the visual
 * hop (a small bump `buildArrowPath` splices into the path) to whichever of
 * the pair has the lexicographically later id — deterministic regardless of
 * iteration/render order, and guarantees exactly one of the two ever hops
 * at a given crossing, never both or neither.
 */
export function findArrowCrossings(polylines: ReadonlyMap<string, Point[]>): Map<string, Point[]> {
  const hopsByArrowId = new Map<string, Point[]>();
  const ids = [...polylines.keys()];

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const idA = ids[i];
      const idB = ids[j];
      const segmentsA = toSegments(polylines.get(idA)!);
      const segmentsB = toSegments(polylines.get(idB)!);
      const hoppingId = idA > idB ? idA : idB;

      for (const segmentA of segmentsA) {
        for (const segmentB of segmentsB) {
          const crossing = perpendicularCrossing(segmentA, segmentB);
          if (!crossing) continue;
          const hops = hopsByArrowId.get(hoppingId) ?? [];
          hops.push(crossing);
          hopsByArrowId.set(hoppingId, hops);
        }
      }
    }
  }

  return hopsByArrowId;
}
