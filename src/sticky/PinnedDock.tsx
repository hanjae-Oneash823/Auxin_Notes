import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { useStickyStore } from './stickyStore';
import { StickyNoteCard } from './StickyNoteCard';

/**
 * Always-reachable home for pinned notes (a running grocery list, a wish
 * list) — these never appear on the physics board (see plan's Pinning
 * decision). Reordering is simple up/down move buttons rather than a second
 * pointer-drag implementation alongside `FolderTree.tsx`'s — not enough
 * pinned notes at once to need it.
 */
export function PinnedDock() {
  const notes = useStickyStore((state) => state.notes);
  const reorderPinned = useStickyStore((state) => state.reorderPinned);

  const pinnedNotes = notes
    .filter((note) => note.pinned)
    .sort((a, b) => (a.pinnedOrder ?? 0) - (b.pinnedOrder ?? 0));

  function move(index: number, delta: number) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= pinnedNotes.length) return;
    const orderedIds = pinnedNotes.map((note) => note.id);
    [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];
    void reorderPinned(orderedIds);
  }

  return (
    <div className="flex flex-col gap-3 pr-3">
      <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
        [pinned]
      </span>
      {pinnedNotes.length === 0 && (
        <span className="text-fg-faint" style={{ fontSize: '0.75rem' }}>
          nothing pinned yet — pin a note from the board to keep it here.
        </span>
      )}
      <div className="flex flex-col gap-3">
        {pinnedNotes.map((note, index) => (
          <div key={note.id} className="flex items-start gap-1">
            <div className="flex flex-col opacity-60">
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="disabled:opacity-30">
                <CaretUp size={12} weight="bold" />
              </button>
              <button
                type="button"
                disabled={index === pinnedNotes.length - 1}
                onClick={() => move(index, 1)}
                className="disabled:opacity-30"
              >
                <CaretDown size={12} weight="bold" />
              </button>
            </div>
            <StickyNoteCard note={note} />
          </div>
        ))}
      </div>
    </div>
  );
}
