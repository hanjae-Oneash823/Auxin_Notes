import { findArrowCrossings } from './arrowCrossings';
import { rectCenter, rectsIntersect, type Point } from './canvasGeometry';
import { countLabelCollisions } from './labelCollisions';
import type { LayoutArrow, LayoutCard } from './optimizeLayout';

/** A swap is refused if it leaves two cards closer than this. */
const MIN_CLEARANCE_PX = 16;
const MAX_PASSES = 4;
/** A label sitting on a card or another label is worse than an arrow crossing. */
const LABEL_COLLISION_WEIGHT = 3;

/** Crossings plus weighted label collisions, for a layout scored on
 *  straight center-to-center lines standing in for the real routes: cheap enough
 *  to score every candidate swap, and crossings there track crossings after
 *  `libavoid` routes them. */
function countCrossings(cards: readonly LayoutCard[], arrows: readonly LayoutArrow[]): number {
  const centers = new Map(cards.map((card) => [card.id, rectCenter(card)]));
  const routes = new Map<string, Point[]>();
  arrows.forEach((arrow, index) => {
    const from = centers.get(arrow.fromCardId);
    const to = centers.get(arrow.toCardId);
    if (from && to) routes.set(String(index), [from, to]);
  });
  let total = LABEL_COLLISION_WEIGHT * countLabelCollisions(cards, arrows);
  for (const hops of findArrowCrossings(routes).values()) total += hops.length;
  return total;
}

export function overlapsAny(card: LayoutCard, others: readonly LayoutCard[]): boolean {
  const padded = {
    x: card.x - MIN_CLEARANCE_PX,
    y: card.y - MIN_CLEARANCE_PX,
    w: card.w + 2 * MIN_CLEARANCE_PX,
    h: card.h + 2 * MIN_CLEARANCE_PX,
  };
  return others.some((other) => other.id !== card.id && rectsIntersect(padded, other));
}

/** Swaps the centers of two cards (their sizes may differ). */
function swapped(a: LayoutCard, b: LayoutCard): [LayoutCard, LayoutCard] {
  const ca = rectCenter(a);
  const cb = rectCenter(b);
  return [
    { ...a, x: cb.x - a.w / 2, y: cb.y - a.h / 2 },
    { ...b, x: ca.x - b.w / 2, y: ca.y - b.h / 2 },
  ];
}

/**
 * Greedy pair-swap pass over an already-laid-out board: repeatedly exchanges
 * the positions of two connected, movable cards whenever that strictly lowers
 * the number of arrow crossings and doesn't push either into a neighbour.
 * Stops when a full pass finds no improving swap (or after `MAX_PASSES`).
 * Returns the cards with their new positions; the input is not mutated.
 */
export function reduceCrossings(
  cards: readonly LayoutCard[],
  arrows: readonly LayoutArrow[],
  movableIds?: ReadonlySet<string>,
): LayoutCard[] {
  const connected = new Set(arrows.flatMap((arrow) => [arrow.fromCardId, arrow.toCardId]));
  const swappable = (card: LayoutCard) => connected.has(card.id) && (!movableIds || movableIds.has(card.id));

  let current = [...cards];
  let best = countCrossings(current, arrows);

  for (let pass = 0; pass < MAX_PASSES && best > 0; pass++) {
    let improved = false;
    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        if (!swappable(current[i]) || !swappable(current[j])) continue;
        const [a, b] = swapped(current[i], current[j]);
        const next = current.map((card, index) => (index === i ? a : index === j ? b : card));
        if (overlapsAny(a, next) || overlapsAny(b, next)) continue;
        const score = countCrossings(next, arrows);
        if (score >= best) continue;
        current = next;
        best = score;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return current;
}
