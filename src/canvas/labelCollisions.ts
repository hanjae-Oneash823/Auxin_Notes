import { edgePoint, rectCenter, rectsIntersect, type Rect } from './canvasGeometry';
import type { LayoutArrow, LayoutCard } from './optimizeLayout';

/** Breathing room added around a label's text when checking what it touches. */
const LABEL_PADDING_PX = 6;

/** Where each labeled arrow's label sits, approximated for a straight arrow:
 *  centered on the middle of the segment between the two cards' edges (the real
 *  route, and so the real label, can differ once it bends around other cards). */
export function labelRects(cards: readonly LayoutCard[], arrows: readonly LayoutArrow[]): Rect[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return arrows.flatMap((arrow) => {
    const label = arrow.label;
    const from = byId.get(arrow.fromCardId);
    const to = byId.get(arrow.toCardId);
    if (!label || !from || !to) return [];
    const start = edgePoint(from, rectCenter(to));
    const end = edgePoint(to, rectCenter(from));
    const width = label.w + 2 * LABEL_PADDING_PX;
    const height = label.h + 2 * LABEL_PADDING_PX;
    return [{ x: (start.x + end.x) / 2 - width / 2, y: (start.y + end.y) / 2 - height / 2, w: width, h: height }];
  });
}

/** How many label-over-card and label-over-label overlaps a layout has. */
export function countLabelCollisions(cards: readonly LayoutCard[], arrows: readonly LayoutArrow[]): number {
  const labels = labelRects(cards, arrows);
  if (labels.length === 0) return 0;
  let collisions = 0;
  labels.forEach((label, i) => {
    collisions += cards.filter((card) => rectsIntersect(label, card)).length;
    collisions += labels.slice(i + 1).filter((other) => rectsIntersect(label, other)).length;
  });
  return collisions;
}
