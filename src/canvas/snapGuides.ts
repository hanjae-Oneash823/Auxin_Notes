import type { Rect } from './canvasGeometry';

/** A line to draw while snapping: `position` on its own axis, running from
 *  `from` to `to` along the other. */
export interface Guide {
  orientation: 'vertical' | 'horizontal';
  position: number;
  from: number;
  to: number;
}

export interface SnapResult {
  /** Extra shift to add to the proposed move so an edge or center lines up. */
  dx: number;
  dy: number;
  guides: Guide[];
}

/** Two features count as aligned within this many world px. */
const ALIGNED_EPSILON = 0.5;

type Axis = 'x' | 'y';

/** Left/center/right (or top/middle/bottom) of `rect` along `axis`. */
function featuresOf(rect: Rect, axis: Axis): number[] {
  const start = axis === 'x' ? rect.x : rect.y;
  const size = axis === 'x' ? rect.w : rect.h;
  return [start, start + size / 2, start + size];
}

/** The smallest shift (within `threshold`) that lines a feature of `moving` up
 *  with a feature of any of `others` on `axis`, or 0. */
function bestShift(moving: Rect, others: readonly Rect[], axis: Axis, threshold: number): number {
  let best = 0;
  let bestDistance = threshold + 1;
  for (const feature of featuresOf(moving, axis)) {
    for (const other of others) {
      for (const candidate of featuresOf(other, axis)) {
        const distance = Math.abs(candidate - feature);
        if (distance <= threshold && distance < bestDistance) {
          best = candidate - feature;
          bestDistance = distance;
        }
      }
    }
  }
  return bestDistance <= threshold ? best : 0;
}

/** Guides for every alignment `moving` has with `others` along `axis`, each
 *  spanning from the moving rect to the furthest card it lines up with. */
function guidesFor(moving: Rect, others: readonly Rect[], axis: Axis): Guide[] {
  const other: Axis = axis === 'x' ? 'y' : 'x';
  const spanOf = (rect: Rect): [number, number] => {
    const [start, , end] = featuresOf(rect, other);
    return [start, end];
  };
  const byPosition = new Map<number, [number, number]>();
  for (const feature of featuresOf(moving, axis)) {
    for (const rect of others) {
      for (const candidate of featuresOf(rect, axis)) {
        if (Math.abs(candidate - feature) > ALIGNED_EPSILON) continue;
        const [movingStart, movingEnd] = spanOf(moving);
        const [start, end] = spanOf(rect);
        const key = Math.round(candidate * 2) / 2;
        const known = byPosition.get(key);
        byPosition.set(key, [Math.min(start, movingStart, known?.[0] ?? Infinity), Math.max(end, movingEnd, known?.[1] ?? -Infinity)]);
      }
    }
  }
  return [...byPosition].map(([position, [from, to]]) => ({
    orientation: axis === 'x' ? 'vertical' : 'horizontal',
    position,
    from,
    to,
  }));
}

/**
 * Snapping for a drag. `moving` is the dragged card (or the bounds of the
 * dragged group) at the position the pointer asks for; `others` are the cards
 * that stay put. Within `threshold` world px, an edge or center of `moving`
 * snaps onto an edge or center of another card, independently per axis.
 * Returns the adjustment, plus guide lines for every alignment at the snapped
 * position.
 */
export function snapMove(moving: Rect, others: readonly Rect[], threshold: number): SnapResult {
  if (others.length === 0) return { dx: 0, dy: 0, guides: [] };
  const dx = bestShift(moving, others, 'x', threshold);
  const dy = bestShift(moving, others, 'y', threshold);
  const snapped = { ...moving, x: moving.x + dx, y: moving.y + dy };
  return { dx, dy, guides: [...guidesFor(snapped, others, 'x'), ...guidesFor(snapped, others, 'y')] };
}
