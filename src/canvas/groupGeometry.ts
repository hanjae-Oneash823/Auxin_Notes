import type { CanvasCard, CanvasDocument, CanvasGroup } from '../vault/canvasTypes';
import { GROUP_HEADER_H, GROUP_PADDING_PX } from './canvasConstants';
import { rectCenter, type Rect } from './canvasGeometry';
import { unionRects } from './minimapGeometry';

/** The frame that snugly wraps `rects` (non-empty), with room for the title strip on top. */
export function frameAround(rects: readonly Rect[]): Rect {
  const box = unionRects(rects);
  return {
    x: box.x - GROUP_PADDING_PX,
    y: box.y - GROUP_PADDING_PX - GROUP_HEADER_H,
    w: box.w + 2 * GROUP_PADDING_PX,
    h: box.h + 2 * GROUP_PADDING_PX + GROUP_HEADER_H,
  };
}

export const childGroupIds = (group: CanvasGroup): readonly string[] => group.groupIds ?? [];

export function indexGroups(groups: readonly CanvasGroup[]): Map<string, CanvasGroup> {
  return new Map(groups.map((g) => [g.id, g]));
}

/** Child id → parent id. */
export function parentMap(groups: readonly CanvasGroup[]): Map<string, string> {
  return new Map(groups.flatMap((g) => childGroupIds(g).map((child) => [child, g.id] as const)));
}

/** Every card in `group` and in the groups nested under it. */
export function descendantCardIds(group: CanvasGroup, byId: ReadonlyMap<string, CanvasGroup>, seen = new Set<string>()): string[] {
  if (seen.has(group.id)) return [];
  seen.add(group.id);
  return [...group.cardIds, ...childGroupIds(group).flatMap((id) => (byId.has(id) ? descendantCardIds(byId.get(id)!, byId, seen) : []))];
}

/** Ids of the groups nested (at any depth) under `group`. */
export function descendantGroupIds(group: CanvasGroup, byId: ReadonlyMap<string, CanvasGroup>, seen = new Set<string>()): string[] {
  if (seen.has(group.id)) return [];
  seen.add(group.id);
  return childGroupIds(group).flatMap((id) => (byId.has(id) ? [id, ...descendantGroupIds(byId.get(id)!, byId, seen)] : []));
}

/** How many groups enclose each group (0 = top level). */
export function groupDepths(groups: readonly CanvasGroup[]): Map<string, number> {
  const parents = parentMap(groups);
  const depthOf = (id: string, hops = 0): number => (parents.has(id) && hops < groups.length ? 1 + depthOf(parents.get(id)!, hops + 1) : 0);
  return new Map(groups.map((g) => [g.id, depthOf(g.id)]));
}

/** The frame of every group that has something to draw around, each wrapping
 *  its own cards and its child groups' frames. */
export function groupFrames(cards: readonly CanvasCard[], groups: readonly CanvasGroup[]): Map<string, Rect> {
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const byId = indexGroups(groups);
  const frames = new Map<string, Rect | null>();
  const frameOf = (group: CanvasGroup): Rect | null => {
    if (frames.has(group.id)) return frames.get(group.id)!;
    frames.set(group.id, null); // a cycle resolves to "nothing" instead of recursing forever
    const rects = [
      ...group.cardIds.flatMap((id) => cardsById.get(id) ?? []),
      ...childGroupIds(group).flatMap((id) => (byId.has(id) ? (frameOf(byId.get(id)!) ?? []) : [])),
    ];
    const frame = rects.length > 0 ? frameAround(rects) : null;
    frames.set(group.id, frame);
    return frame;
  };
  groups.forEach(frameOf);
  return new Map([...frames].flatMap(([id, frame]) => (frame ? [[id, frame] as const] : [])));
}

const contains = (frame: Rect, p: { x: number; y: number }) => p.x >= frame.x && p.x <= frame.x + frame.w && p.y >= frame.y && p.y <= frame.y + frame.h;

/** The deepest of `candidates` (group ids) whose frame contains `point`. */
export function deepestContaining(
  point: { x: number; y: number },
  candidates: readonly CanvasGroup[],
  frames: ReadonlyMap<string, Rect>,
  depths: ReadonlyMap<string, number>,
): string | null {
  const hits = candidates.filter((g) => frames.has(g.id) && contains(frames.get(g.id)!, point));
  hits.sort((a, b) => (depths.get(b.id) ?? 0) - (depths.get(a.id) ?? 0));
  return hits[0]?.id ?? null;
}

/** Which group each of `cardIds` would join if dropped now: those in no group
 *  whose center is inside a group's frame (the innermost frame wins). Keyed by group id. */
export function dropTargets(doc: CanvasDocument, cardIds: ReadonlySet<string>): Map<string, string[]> {
  const grouped = new Set(doc.groups.flatMap((g) => g.cardIds));
  const frames = groupFrames(doc.cards, doc.groups);
  const depths = groupDepths(doc.groups);
  const targets = new Map<string, string[]>();
  for (const card of doc.cards) {
    if (!cardIds.has(card.id) || grouped.has(card.id)) continue;
    const hit = deepestContaining(rectCenter(card), doc.groups, frames, depths);
    if (hit) targets.set(hit, [...(targets.get(hit) ?? []), card.id]);
  }
  return targets;
}
