import type { Point, Rect } from './canvasGeometry';

export type FlipAxis = 'horizontal' | 'vertical';

/** Mirrors the cards' positions across the middle of their combined bounds —
 *  a horizontal flip swaps left and right, a vertical one top and bottom.
 *  Only positions move; each card keeps its own orientation and size, so
 *  text stays readable. Returns a new top-left per card in `cards`. */
export function flipPositions(cards: readonly (Rect & { id: string })[], axis: FlipAxis): Map<string, Point> {
  if (cards.length === 0) return new Map();
  const min = axis === 'horizontal' ? Math.min(...cards.map((c) => c.x)) : Math.min(...cards.map((c) => c.y));
  const max =
    axis === 'horizontal' ? Math.max(...cards.map((c) => c.x + c.w)) : Math.max(...cards.map((c) => c.y + c.h));
  return new Map(
    cards.map((card) => [
      card.id,
      axis === 'horizontal' ? { x: min + max - (card.x + card.w), y: card.y } : { x: card.x, y: min + max - (card.y + card.h) },
    ]),
  );
}
