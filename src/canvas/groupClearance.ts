import type { CanvasCard, CanvasGroup } from '../vault/canvasTypes';
import { GROUP_CLEARANCE_PX } from './canvasConstants';
import type { Point, Rect } from './canvasGeometry';
import { descendantCardIds, groupFrames, indexGroups, parentMap } from './groupGeometry';

const MAX_ROUNDS = 60;

interface Block {
  ids: string[];
  /** A group's frame, or a lone card's own box. */
  rect: Rect;
  isGroup: boolean;
  /** Holds a pinned card, so layout may not move it. */
  isFixed: boolean;
}

/** Amount by which `a` and `b` (kept `gap` apart) overlap on each axis; both positive means they collide. */
function penetration(a: Rect, b: Rect, gap: number) {
  return {
    x: Math.min(a.x + a.w + gap - b.x, b.x + b.w + gap - a.x),
    y: Math.min(a.y + a.h + gap - b.y, b.y + b.h + gap - a.y),
  };
}

/** Takes a layout's `targets` (new top-lefts for the cards it moved) and nudges
 *  whole groups, and cards outside any group, apart until no group frame
 *  touches or overlaps another block. A group moves as one rigid piece, so its
 *  own arrangement is kept; a block with a pinned card (per `movableIds`)
 *  never moves. Returns positions for every card that moved, or was in `targets`. */
export function withGroupClearance(
  cards: readonly CanvasCard[],
  groups: readonly CanvasGroup[],
  targets: ReadonlyMap<string, Point>,
  movableIds?: ReadonlySet<string>,
): Map<string, Point> {
  if (groups.length === 0) return new Map(targets);

  const positions = new Map(cards.map((c) => [c.id, targets.get(c.id) ?? { x: c.x, y: c.y }]));
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const boxOf = (id: string): Rect => ({ ...positions.get(id)!, w: cardsById.get(id)!.w, h: cardsById.get(id)!.h });
  const byId = indexGroups(groups);
  const parents = parentMap(groups);
  const frames = groupFrames(cards.map((c) => ({ ...c, ...positions.get(c.id)! })), groups);
  const isFixedId = (id: string) => movableIds !== undefined && !movableIds.has(id);

  const grouped = new Set<string>();
  const blocks: Block[] = [];
  // Only top-level groups are blocks: a nested group travels with its parent.
  for (const group of groups) {
    const frame = frames.get(group.id);
    if (!frame || parents.has(group.id)) continue;
    const ids = descendantCardIds(group, byId).filter((id) => cardsById.has(id) && !grouped.has(id));
    ids.forEach((id) => grouped.add(id));
    blocks.push({ ids, rect: frame, isGroup: true, isFixed: ids.some(isFixedId) });
  }
  for (const card of cards) {
    if (!grouped.has(card.id)) blocks.push({ ids: [card.id], rect: boxOf(card.id), isGroup: false, isFixed: isFixedId(card.id) });
  }

  const moved = new Set<string>();
  const shift = (block: Block, dx: number, dy: number) => {
    block.rect = { ...block.rect, x: block.rect.x + dx, y: block.rect.y + dy };
    for (const id of block.ids) {
      const p = positions.get(id)!;
      positions.set(id, { x: p.x + dx, y: p.y + dy });
      moved.add(id);
    }
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let changed = false;
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i];
        const b = blocks[j];
        // Loose cards were already spaced by the layout; only group frames need room.
        if (!(a.isGroup || b.isGroup) || (a.isFixed && b.isFixed)) continue;
        const p = penetration(a.rect, b.rect, GROUP_CLEARANCE_PX);
        if (p.x <= 0 || p.y <= 0) continue;
        const isHorizontal = p.x <= p.y;
        const amount = isHorizontal ? p.x : p.y;
        const sign = (isHorizontal ? a.rect.x + a.rect.w / 2 < b.rect.x + b.rect.w / 2 : a.rect.y + a.rect.h / 2 < b.rect.y + b.rect.h / 2) ? -1 : 1;
        const share = a.isFixed || b.isFixed ? 1 : 0.5;
        if (!a.isFixed) shift(a, isHorizontal ? sign * amount * share : 0, isHorizontal ? 0 : sign * amount * share);
        if (!b.isFixed) shift(b, isHorizontal ? -sign * amount * share : 0, isHorizontal ? 0 : -sign * amount * share);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const result = new Map(targets);
  for (const id of moved) result.set(id, positions.get(id)!);
  return result;
}
