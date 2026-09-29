import { Layout, type InputNode, type Link } from 'webcola';
import { alignCards } from './alignCards';
import type { Point, Rect } from './canvasGeometry';
import { reduceCrossings } from './reduceCrossings';

/** Clear space kept between cards with no arrows, once overlaps are removed. */
const LOOSE_GAP_PX = 40;
/** Same, for cards that have arrows — room for a straight run plus a head. */
const CONNECTED_GAP_PX = 66;
/** Extra room per additional arrow between the same pair, so they don't hairpin. */
const PARALLEL_ARROW_GAP_PX = 20;
/** Extra center-to-center distance, on top of the two cards' average half-size, that
 *  a connected pair is pulled toward — enough for an arrow to read. */
const LINK_SLACK_PX = 46;
/** Extra clear space around a label's box, on top of its own size. */
const LABEL_GAP_PX = 12;
/** Solver passes: free force layout, then with overlap constraints applied. */
const UNCONSTRAINED_ITERATIONS = 30;
const CONSTRAINED_ITERATIONS = 120;
/** Aspect-ratio floor for packing disconnected clusters together. */
const MIN_PACK_SIZE_PX = 800;

export interface LayoutCard extends Rect {
  id: string;
}

export interface LayoutArrow {
  fromCardId: string;
  toCardId: string;
  /** Size of the arrow's drawn label, if it has one; the layout keeps a box
   *  this big clear of cards and of other labels. */
  label?: { w: number; h: number };
}

interface SizedLink extends Link<number> {
  length: number;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Force-directed layout (WebCola, the JS port of Adaptagrams' libcola) that
 *  pulls connected cards together and pushes every card clear of the others,
 *  leaving more room around cards with arrows — and between a pair joined by
 *  several. Then two clean-up passes: `reduceCrossings.ts` swaps cards to
 *  untangle arrows, and `alignCards.ts` lines cards up on shared rows/columns.
 *
 *  Returns a new top-left position per movable card, re-centered on where
 *  those cards' centroid already was so the result lands in view. With
 *  `movableIds`, only those cards move; the rest stay pinned in place and the
 *  movers arrange around them. Pure: takes no board state, writes none. */
export function optimizeLayout(
  cards: readonly LayoutCard[],
  arrows: readonly LayoutArrow[],
  movableIds?: ReadonlySet<string>,
  /** False skips the crossing-swap pass. Repeated runs ("optimize" does four)
   *  should swap only once: swapping again flips cards back and forth. */
  shouldSwapCards = true,
): Map<string, Point> {
  const isMovable = (card: LayoutCard) => !movableIds || movableIds.has(card.id);
  const indexById = new Map(cards.map((card, index) => [card.id, index]));

  const arrowCountByPair = new Map<string, number>();
  const connectedIds = new Set<string>();
  const maxParallelByCard = new Map<string, number>();
  for (const { fromCardId, toCardId } of arrows) {
    const key = pairKey(fromCardId, toCardId);
    const count = (arrowCountByPair.get(key) ?? 0) + 1;
    arrowCountByPair.set(key, count);
    for (const id of [fromCardId, toCardId]) {
      connectedIds.add(id);
      maxParallelByCard.set(id, Math.max(maxParallelByCard.get(id) ?? 1, count));
    }
  }
  const gapAround = (card: LayoutCard) =>
    connectedIds.has(card.id)
      ? CONNECTED_GAP_PX + PARALLEL_ARROW_GAP_PX * ((maxParallelByCard.get(card.id) ?? 1) - 1)
      : LOOSE_GAP_PX;

  const nodes: InputNode[] = cards.map((card) => ({
    x: card.x + card.w / 2,
    y: card.y + card.h / 2,
    width: card.w + gapAround(card),
    height: card.h + gapAround(card),
    fixed: isMovable(card) ? 0 : 1,
  }));

  // A labeled arrow is routed through a stand-in node the size of its label
  // (source — label — target), so the overlap solver keeps that box off every
  // card and off other labels while it sits between its two cards.
  const labelNodes: InputNode[] = [];
  const links: SizedLink[] = arrows.flatMap((arrow) => {
    const source = indexById.get(arrow.fromCardId);
    const target = indexById.get(arrow.toCardId);
    if (source === undefined || target === undefined || source === target) return [];
    const a = cards[source];
    const b = cards[target];
    const length = (a.w + b.w) / 4 + (a.h + b.h) / 4 + LINK_SLACK_PX;
    if (!arrow.label) return [{ source, target, length }];

    const labelIndex = cards.length + labelNodes.length;
    labelNodes.push({
      x: (nodes[source].x! + nodes[target].x!) / 2,
      y: (nodes[source].y! + nodes[target].y!) / 2,
      width: arrow.label.w + LABEL_GAP_PX,
      height: arrow.label.h + LABEL_GAP_PX,
    });
    // The label's own size lengthens the run a little so it isn't squeezed against a card.
    const half = length / 2 + Math.max(arrow.label.w, arrow.label.h) / 2;
    return [
      { source, target: labelIndex, length: half },
      { source: labelIndex, target, length: half },
    ];
  });
  nodes.push(...labelNodes);

  const bounds = boundsOf(cards);
  const layout = new Layout()
    .nodes(nodes)
    .links(links)
    .linkDistance((link) => (link as SizedLink).length)
    .avoidOverlaps(true)
    // Packing moves whole clusters, which would unpin the fixed cards.
    .handleDisconnected(!movableIds)
    .size([Math.max(bounds.w, MIN_PACK_SIZE_PX), Math.max(bounds.h, MIN_PACK_SIZE_PX)])
    .start(UNCONSTRAINED_ITERATIONS, 0, CONSTRAINED_ITERATIONS, 0, false, false);

  const placed = layout.nodes();
  const movers = cards.filter(isMovable);
  const before = centroid(movers.map((card) => ({ x: card.x + card.w / 2, y: card.y + card.h / 2 })));
  const after = centroid(movers.map((card) => placed[indexById.get(card.id) ?? 0]));
  // Pinned cards must not drift, so only re-center when everything moves.
  const shift = movableIds ? { x: 0, y: 0 } : { x: before.x - after.x, y: before.y - after.y };

  const laidOut: LayoutCard[] = cards.map((card) => {
    if (!isMovable(card)) return card;
    const node = placed[indexById.get(card.id) ?? 0];
    return { ...card, x: node.x + shift.x - card.w / 2, y: node.y + shift.y - card.h / 2 };
  });
  const untangled = shouldSwapCards ? reduceCrossings(laidOut, arrows, movableIds) : laidOut;
  const aligned = alignCards(untangled, arrows, movableIds);
  return new Map(aligned.filter(isMovable).map((card) => [card.id, { x: card.x, y: card.y }]));
}

function centroid(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function boundsOf(cards: readonly Rect[]): Rect {
  if (cards.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const minX = Math.min(...cards.map((c) => c.x));
  const minY = Math.min(...cards.map((c) => c.y));
  const maxX = Math.max(...cards.map((c) => c.x + c.w));
  const maxY = Math.max(...cards.map((c) => c.y + c.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
