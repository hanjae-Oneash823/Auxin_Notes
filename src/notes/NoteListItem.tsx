import { Stack } from '@phosphor-icons/react';
import type { NoteSummary } from '../db/queries/notes';

interface NoteListItemProps {
  note: NoteSummary;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}

export function NoteListItem({
  note,
  isActive,
  isRenaming,
  renameValue,
  onSelect,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: NoteListItemProps) {
  if (isRenaming) {
    return (
      <input
        autoFocus
        value={renameValue}
        onChange={(event) => onRenameChange(event.target.value)}
        onBlur={onRenameCancel}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onRenameCommit();
          if (event.key === 'Escape') onRenameCancel();
        }}
        className="w-full rounded-row border border-border-strong bg-transparent px-1 text-left text-fg-prominent outline-none"
        style={{ fontSize: '0.85rem' }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onStartRename}
      className={`flex w-full items-center gap-1.5 truncate rounded-row px-1.5 py-0.5 text-left transition-colors duration-panel ease-panel ${
        isActive ? 'bg-border-default text-fg' : 'text-fg-muted hover:bg-border-subtle hover:text-fg-prominent'
      }`}
      style={{ fontSize: '0.85rem' }}
    >
      {note.isCanvas && <Stack size={12} weight="regular" className="shrink-0" />}
      <span className="truncate">{note.title}</span>
    </button>
  );
}
