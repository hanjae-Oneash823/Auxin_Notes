import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { NoteListItem } from './NoteListItem';
import type { NoteSummary } from '../db/queries/notes';

const ROW_HEIGHT_PX = 26;
const OVERSCAN = 12;

interface NoteListProps {
  notes: NoteSummary[];
  /** Vault-relative path of the currently open note, if any. */
  activePath: string | null;
  renamingId: string | null;
  renameValue: string;
  onSelect: (path: string) => void;
  onStartRename: (note: NoteSummary) => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: (note: NoteSummary) => void;
  onRenameCancel: () => void;
}

/**
 * Virtualized so a vault of thousands of notes doesn't render thousands of
 * DOM nodes (see plan §Risks: large vaults) — only rows in/near the visible
 * scroll range are mounted at once.
 */
export function NoteList({
  notes,
  activePath,
  renamingId,
  renameValue,
  onSelect,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: NoteListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: OVERSCAN,
  });

  if (notes.length === 0) {
    return (
      <span className="px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
        no notes
      </span>
    );
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const note = notes[virtualRow.index];
          return (
            <div
              key={note.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <NoteListItem
                note={note}
                isActive={activePath === note.path}
                isRenaming={renamingId === note.id}
                renameValue={renameValue}
                onSelect={() => onSelect(note.path)}
                onStartRename={() => onStartRename(note)}
                onRenameChange={onRenameChange}
                onRenameCommit={() => onRenameCommit(note)}
                onRenameCancel={onRenameCancel}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
