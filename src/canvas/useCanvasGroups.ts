import { useRef } from 'react';
import { ulid } from 'ulid';
import type { CanvasDocument, CanvasGroup } from '../vault/canvasTypes';
import { lockToAxis, rectCenter, type Point } from './canvasGeometry';
import {
  childGroupIds,
  deepestContaining,
  descendantCardIds,
  descendantGroupIds,
  dropTargets,
  groupDepths,
  groupFrames,
  indexGroups,
  parentMap,
} from './groupGeometry';
import type { HistoryMode } from './useCanvasHistory';

interface UseCanvasGroupsOptions {
  getDoc: () => CanvasDocument | null;
  updateDoc: (updater: (doc: CanvasDocument) => CanvasDocument, mode?: HistoryMode) => void;
}

/** Drops links to groups that no longer exist, and any group left with nothing in it. */
function pruneGroups(groups: readonly CanvasGroup[]): CanvasGroup[] {
  let current = [...groups];
  for (;;) {
    const ids = new Set(current.map((g) => g.id));
    const next = current
      .map((g) => ({ ...g, groupIds: childGroupIds(g).filter((id) => ids.has(id)) }))
      .filter((g) => g.cardIds.length > 0 || g.groupIds.length > 0);
    if (next.length === current.length && next.every((g, i) => g.groupIds.length === childGroupIds(current[i]).length)) return next;
    current = next;
  }
}

/** Takes `ids` out of the cards of every group. */
function withoutCards(groups: readonly CanvasGroup[], ids: ReadonlySet<string>): CanvasGroup[] {
  return pruneGroups(groups.map((g) => ({ ...g, cardIds: g.cardIds.filter((id) => !ids.has(id)) })));
}

/** Group edits. A card is in at most one group and a group in at most one
 *  parent; a frame is drawn from its contents (see `groupFrames`), so moving a
 *  frame means moving every card under it. */
export function useCanvasGroups({ getDoc, updateDoc }: UseCanvasGroupsOptions) {
  const dragSnapshot = useRef<{ groupId: string; cards: Map<string, Point> } | null>(null);

  /** Every card under `groupId`, nested groups included. */
  function membersOf(groupId: string): string[] {
    const groups = getDoc()?.groups ?? [];
    const group = groups.find((g) => g.id === groupId);
    return group ? descendantCardIds(group, indexGroups(groups)) : [];
  }

  /** Groups `cardIds`. A group whose cards are all selected is nested inside
   *  the new group whole; other selected cards leave whatever group they were in. */
  function groupCards(cardIds: ReadonlySet<string>) {
    const doc = getDoc();
    if (!doc) return;
    const selected = new Set(doc.cards.filter((c) => cardIds.has(c.id)).map((c) => c.id));
    if (selected.size === 0) return;
    const byId = indexGroups(doc.groups);
    const parents = parentMap(doc.groups);
    const covered = new Set(
      doc.groups
        .filter((g) => {
          const all = descendantCardIds(g, byId);
          return all.length > 0 && all.every((id) => selected.has(id));
        })
        .map((g) => g.id),
    );
    const nested = doc.groups.filter((g) => covered.has(g.id) && !covered.has(parents.get(g.id) ?? ''));
    const nestedCards = new Set(nested.flatMap((g) => descendantCardIds(g, byId)));
    const direct = [...selected].filter((id) => !nestedCards.has(id));
    if (nested.length === 1 && direct.length === 0) return; // already exactly one group
    const nestedIds = new Set(nested.map((g) => g.id));
    updateDoc((d) => ({
      ...d,
      groups: pruneGroups([
        ...d.groups.map((g) => ({
          ...g,
          cardIds: g.cardIds.filter((id) => !direct.includes(id)),
          groupIds: childGroupIds(g).filter((id) => !nestedIds.has(id)),
        })),
        { id: ulid(), label: '', cardIds: direct, groupIds: [...nestedIds] },
      ]),
    }));
  }

  /** After a card drag: ungrouped cards dropped inside a frame join that group. */
  function absorbIntoGroups(cardIds: ReadonlySet<string>) {
    const doc = getDoc();
    if (!doc || doc.groups.length === 0) return;
    const joins = dropTargets(doc, cardIds);
    if (joins.size === 0) return;
    updateDoc((d) => ({ ...d, groups: d.groups.map((g) => (joins.has(g.id) ? { ...g, cardIds: [...g.cardIds, ...joins.get(g.id)!] } : g)) }));
  }

  /** After a group drag: a top-level group dropped inside another frame nests in it. */
  function absorbGroup(groupId: string) {
    const doc = getDoc();
    const group = doc?.groups.find((g) => g.id === groupId);
    if (!doc || !group || parentMap(doc.groups).has(groupId)) return;
    const frames = groupFrames(doc.cards, doc.groups);
    const frame = frames.get(groupId);
    if (!frame) return;
    const own = new Set([groupId, ...descendantGroupIds(group, indexGroups(doc.groups))]);
    const target = deepestContaining(rectCenter(frame), doc.groups.filter((g) => !own.has(g.id)), frames, groupDepths(doc.groups));
    if (!target) return;
    updateDoc((d) => ({ ...d, groups: d.groups.map((g) => (g.id === target ? { ...g, groupIds: [...childGroupIds(g), groupId] } : g)) }));
  }

  /** Takes `cardIds` out of their groups; the cards stay put. */
  function removeFromGroups(cardIds: ReadonlySet<string>) {
    updateDoc((d) => ({ ...d, groups: withoutCards(d.groups, cardIds) }));
  }

  /** Dissolves a group; what was in it moves up into its parent (or out on its own). */
  function ungroup(groupId: string) {
    updateDoc((d) => {
      const group = d.groups.find((g) => g.id === groupId);
      if (!group) return d;
      const parent = parentMap(d.groups).get(groupId);
      return {
        ...d,
        groups: pruneGroups(
          d.groups
            .filter((g) => g.id !== groupId)
            .map((g) =>
              g.id === parent
                ? { ...g, cardIds: [...g.cardIds, ...group.cardIds], groupIds: [...childGroupIds(g).filter((id) => id !== groupId), ...childGroupIds(group)] }
                : g,
            ),
        ),
      };
    });
  }

  function startMove(groupId: string) {
    const doc = getDoc();
    if (!doc) return;
    const members = new Set(membersOf(groupId));
    dragSnapshot.current = {
      groupId,
      cards: new Map(doc.cards.filter((c) => members.has(c.id)).map((c) => [c.id, { x: c.x, y: c.y }])),
    };
  }

  function moveBy(groupId: string, rawDx: number, rawDy: number, isAxisLocked = false) {
    const snap = dragSnapshot.current;
    if (snap?.groupId !== groupId) return;
    const { x: dx, y: dy } = isAxisLocked ? lockToAxis({ x: rawDx, y: rawDy }) : { x: rawDx, y: rawDy };
    updateDoc((d) => ({
      ...d,
      cards: d.cards.map((c) => {
        const start = snap.cards.get(c.id);
        return start ? { ...c, x: start.x + dx, y: start.y + dy } : c;
      }),
    }), { group: `group-move:${groupId}` });
  }

  function rename(groupId: string, label: string) {
    updateDoc((d) => ({ ...d, groups: d.groups.map((g) => (g.id === groupId ? { ...g, label } : g)) }), { group: `group-label:${groupId}` });
  }

  return { absorbGroup, absorbIntoGroups, groupCards, removeFromGroups, ungroup, startMove, moveBy, rename, membersOf };
}
