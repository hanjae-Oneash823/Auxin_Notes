import type { CanvasCard, CanvasGroup } from '../vault/canvasTypes';
import type { Point, Rect } from './canvasGeometry';
import { childGroupIds, descendantCardIds, frameAround, groupFrames, indexGroups, parentMap } from './groupGeometry';
import type { LayoutArrow, LayoutCard } from './optimizeLayout';

/** Arranges some boxes (`nodes`) given the arrows between them; returns a new
 *  top-left for each box in `movableIds` (all of them when that's omitted). */
export type LevelLayout = (nodes: LayoutCard[], arrows: LayoutArrow[], movableIds?: ReadonlySet<string>) => Map<string, Point>;

/** How much of a node the layout may move. */
type Freedom = 'all' | 'some' | 'none';

interface Node {
  id: string;
  rect: Rect;
  freedom: Freedom;
  /** Cards the node stands for (just itself, or everything under a group). */
  cardIds: string[];
  /** Set for a group: its id, and for a fully movable one, its contents already arranged. */
  group?: { id: string; arranged: Arranged | null; currentFrame: Rect };
}

/** A group's contents laid out relative to its own frame's top-left. */
interface Arranged {
  w: number;
  h: number;
  offsets: Map<string, Point>;
}

/**
 * Runs `layout` so it respects groups: each group's contents are arranged
 * inside it first (nested groups innermost first), then the finished group is
 * placed as one box among its siblings, with arrows lifted onto the boxes they
 * connect. That keeps a group's cards together and lets the group's frame take
 * part in spacing. With `movableIds`, groups that are only partly selected have
 * just their selected contents rearranged, inside their frame's neighbourhood.
 *
 * Returns a new top-left per card in `movableIds` (every card when omitted).
 */
export function layoutWithGroups(
  cards: readonly CanvasCard[],
  groups: readonly CanvasGroup[],
  arrows: readonly LayoutArrow[],
  movableIds: ReadonlySet<string> | undefined,
  layout: LevelLayout,
): Map<string, Point> {
  const frames = groupFrames(cards, groups);
  if (frames.size === 0) return layout(cards.map(toLayoutCard), [...arrows], movableIds);

  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const byId = indexGroups(groups);
  const parents = parentMap(groups);
  const isMovable = (id: string) => !movableIds || movableIds.has(id);

  const freedomOfCards = (ids: readonly string[]): Freedom => {
    const movable = ids.filter(isMovable).length;
    return movable === ids.length ? 'all' : movable === 0 ? 'none' : 'some';
  };

  const nodesOf = (memberCards: readonly string[], childGroups: readonly string[]): Node[] => [
    ...memberCards.flatMap((id) => {
      const card = cardsById.get(id);
      return card ? [{ id, rect: toLayoutCard(card), freedom: freedomOfCards([id]), cardIds: [id] } satisfies Node] : [];
    }),
    ...childGroups.flatMap((id) => {
      const group = byId.get(id);
      const currentFrame = frames.get(id);
      if (!group || !currentFrame) return [];
      const ids = descendantCardIds(group, byId);
      const freedom = freedomOfCards(ids);
      const arranged = freedom === 'all' ? arrangeGroup(group) : null;
      // A rearranged group is sized by its new layout but stays centred where it was.
      const rect = arranged
        ? { x: currentFrame.x + (currentFrame.w - arranged.w) / 2, y: currentFrame.y + (currentFrame.h - arranged.h) / 2, w: arranged.w, h: arranged.h }
        : currentFrame;
      return [{ id: `group:${id}`, rect, freedom, cardIds: ids, group: { id, arranged, currentFrame } } satisfies Node];
    }),
  ];

  /** New top-left per node, arranging `nodes` among themselves. */
  const place = (nodes: Node[]): Map<string, Point> => {
    const owner = new Map(nodes.flatMap((n) => n.cardIds.map((id) => [id, n.id] as const)));
    const lifted = arrows.flatMap((a) => {
      const from = owner.get(a.fromCardId);
      const to = owner.get(a.toCardId);
      return from && to && from !== to ? [{ ...a, fromCardId: from, toCardId: to }] : [];
    });
    const movingIds = new Set(nodes.filter((n) => n.freedom === 'all').map((n) => n.id));
    const isEveryoneFree = movingIds.size === nodes.length;
    const placed = movingIds.size > 0 ? layout(nodes.map((n) => ({ ...n.rect, id: n.id })), lifted, isEveryoneFree ? undefined : movingIds) : new Map<string, Point>();
    return new Map(nodes.map((n) => [n.id, placed.get(n.id) ?? { x: n.rect.x, y: n.rect.y }]));
  };

  function arrangeGroup(group: CanvasGroup): Arranged {
    const nodes = nodesOf(group.cardIds, childGroupIds(group));
    const positions = place(nodes);
    const frame = frameAround(nodes.map((n) => ({ ...n.rect, ...positions.get(n.id)! })));
    const offsets = new Map<string, Point>();
    for (const [id, p] of contentPositions(nodes, positions)) offsets.set(id, { x: p.x - frame.x, y: p.y - frame.y });
    return { w: frame.w, h: frame.h, offsets };
  }

  /** Absolute top-left of every card under `nodes`, once the nodes sit at `positions`. */
  function contentPositions(nodes: Node[], positions: ReadonlyMap<string, Point>): Map<string, Point> {
    const out = new Map<string, Point>();
    for (const node of nodes) {
      const at = positions.get(node.id)!;
      if (!node.group) {
        if (node.freedom === 'all') out.set(node.id, at);
      } else if (node.group.arranged) {
        for (const [id, offset] of node.group.arranged.offsets) out.set(id, { x: at.x + offset.x, y: at.y + offset.y });
      } else if (node.freedom === 'some') {
        // Only some of it is selected: rearrange those cards where they stand.
        for (const [id, p] of layoutPartial(byId.get(node.group.id)!)) out.set(id, p);
      }
    }
    return out;
  }

  function layoutPartial(group: CanvasGroup): Map<string, Point> {
    const nodes = nodesOf(group.cardIds, childGroupIds(group));
    return contentPositions(nodes, place(nodes));
  }

  const topGroups = groups.filter((g) => frames.has(g.id) && !parents.has(g.id)).map((g) => g.id);
  const grouped = new Set(groups.flatMap((g) => descendantCardIds(g, byId)));
  const loose = cards.filter((c) => !grouped.has(c.id)).map((c) => c.id);
  const nodes = nodesOf(loose, topGroups);
  return contentPositions(nodes, place(nodes));
}

function toLayoutCard(c: CanvasCard): LayoutCard {
  return { id: c.id, x: c.x, y: c.y, w: c.w, h: c.h };
}
