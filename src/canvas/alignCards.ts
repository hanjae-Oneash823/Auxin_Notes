import { rectCenter } from './canvasGeometry';
import type { LayoutArrow, LayoutCard } from './optimizeLayout';
import { countLabelCollisions } from './labelCollisions';
import { overlapsAny } from './reduceCrossings';

/** Connected cards this close on one axis get lined up on it. Generous, since
 *  a straight horizontal/vertical arrow is worth a visible nudge. */
const PAIR_ALIGN_TOLERANCE_PX = 100;
/** Any other cards this close on an axis share a row/column. */
const CLUSTER_ALIGN_TOLERANCE_PX = 40;
/** Card centers land on multiples of this; centers that were equal stay equal. */
const GRID_PX = 8;
const MAX_PASSES = 4;

type Axis = 'x' | 'y';

function centerOn(card: LayoutCard, axis: Axis, center: number): LayoutCard {
  return axis === 'x' ? { ...card, x: center - card.w / 2 } : { ...card, y: center - card.h / 2 };
}

const centerAlong = (card: LayoutCard, axis: Axis) => rectCenter(card)[axis];

/** Applies `moved` cards if none of them ends up crowding another card and no
 *  arrow label ends up on a card or another label that it wasn't already on. */
function tryMove(cards: readonly LayoutCard[], moved: readonly LayoutCard[], arrows: readonly LayoutArrow[]): LayoutCard[] | null {
  const byId = new Map(moved.map((card) => [card.id, card]));
  const next = cards.map((card) => byId.get(card.id) ?? card);
  if (moved.some((card) => overlapsAny(card, next))) return null;
  return countLabelCollisions(next, arrows) > countLabelCollisions(cards, arrows) ? null : next;
}

/** For each arrow, lines its lower-degree end up with the other on whichever
 *  axis they already nearly share — so the arrow runs straight instead of
 *  hairpinning between diagonal neighbours. Hubs stay put. */
function alignConnectedPairs(cards: LayoutCard[], arrows: readonly LayoutArrow[], isMovable: (c: LayoutCard) => boolean) {
  const degree = new Map<string, number>();
  for (const { fromCardId, toCardId } of arrows) {
    degree.set(fromCardId, (degree.get(fromCardId) ?? 0) + 1);
    degree.set(toCardId, (degree.get(toCardId) ?? 0) + 1);
  }
  let current = cards;
  for (const arrow of arrows) {
    const a = current.find((c) => c.id === arrow.fromCardId);
    const b = current.find((c) => c.id === arrow.toCardId);
    if (!a || !b || a.id === b.id) continue;
    const dx = Math.abs(centerAlong(a, 'x') - centerAlong(b, 'x'));
    const dy = Math.abs(centerAlong(a, 'y') - centerAlong(b, 'y'));
    const axis: Axis = dx <= dy ? 'x' : 'y';
    if (Math.min(dx, dy) > PAIR_ALIGN_TOLERANCE_PX || Math.min(dx, dy) === 0) continue;
    const [mover, anchor] = (degree.get(a.id) ?? 0) <= (degree.get(b.id) ?? 0) ? [a, b] : [b, a];
    if (!isMovable(mover)) continue;
    const next = tryMove(current, [centerOn(mover, axis, centerAlong(anchor, axis))], arrows);
    if (next) current = next;
  }
  return current;
}

/** Groups movable cards whose centers along `axis` sit within the tolerance
 *  of the group's first card, and moves each group onto its mean line when
 *  that crowds nothing. */
function alignClusters(cards: LayoutCard[], axis: Axis, isMovable: (c: LayoutCard) => boolean, arrows: readonly LayoutArrow[]) {
  const sorted = cards.filter(isMovable).sort((p, q) => centerAlong(p, axis) - centerAlong(q, axis));
  const groups: LayoutCard[][] = [];
  for (const card of sorted) {
    const group = groups[groups.length - 1];
    if (group && centerAlong(card, axis) - centerAlong(group[0], axis) <= CLUSTER_ALIGN_TOLERANCE_PX) group.push(card);
    else groups.push([card]);
  }
  let current = cards;
  for (const group of groups) {
    if (group.length < 2) continue;
    const mean = group.reduce((sum, card) => sum + centerAlong(card, axis), 0) / group.length;
    const next = tryMove(
      current,
      group.map((card) => centerOn(current.find((c) => c.id === card.id) ?? card, axis, mean)),
      arrows,
    );
    if (next) current = next;
  }
  return current;
}

function snapToGrid(cards: LayoutCard[], isMovable: (c: LayoutCard) => boolean, arrows: readonly LayoutArrow[]) {
  let current = cards;
  for (const card of cards.filter(isMovable)) {
    const center = rectCenter(card);
    const moved = { ...card, x: Math.round(center.x / GRID_PX) * GRID_PX - card.w / 2, y: Math.round(center.y / GRID_PX) * GRID_PX - card.h / 2 };
    const next = tryMove(current, [moved], arrows);
    if (next) current = next;
  }
  return current;
}

/**
 * Tidies a finished layout so it reads as deliberate: connected cards share a
 * row/column with each other, other near-aligned cards share one too, and
 * centers sit on a light grid. Every move is refused if it would crowd a
 * neighbour, so this never introduces an overlap. Cards outside `movableIds`
 * are never moved. Returns new positions; the input is not mutated.
 */
export function alignCards(
  cards: readonly LayoutCard[],
  arrows: readonly LayoutArrow[],
  movableIds?: ReadonlySet<string>,
): LayoutCard[] {
  const isMovable = (card: LayoutCard) => !movableIds || movableIds.has(card.id);
  let current = [...cards];
  // One card settling onto a line can unblock (or block) another pair, so
  // sweep until a pass changes nothing.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let next = alignConnectedPairs(current, arrows, isMovable);
    next = alignClusters(next, 'x', isMovable, arrows);
    next = alignClusters(next, 'y', isMovable, arrows);
    const isSettled = next.every((card, i) => card.x === current[i].x && card.y === current[i].y);
    current = next;
    if (isSettled) break;
  }
  return snapToGrid(current, isMovable, arrows);
}
