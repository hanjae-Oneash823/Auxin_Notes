import { FilePdf, Stack } from '@phosphor-icons/react';
import type { NoteSummary } from '../db/queries/notes';
import { PdfSize } from '../pdf/PdfSize';

interface NoteListItemProps {
  note: NoteSummary;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  /** `source` is the clicked row, for the fly-to-tab animation. */
  onSelect: (source: HTMLElement) => void;
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
      onClick={(event) => onSelect(event.currentTarget)}
      onDoubleClick={onStartRename}
      className={`flex w-full items-center gap-1.5 truncate rounded-row px-1.5 py-0.5 text-left transition-colors duration-panel ease-panel ${
        isActive ? 'bg-border-default text-fg' : 'text-fg-muted hover:bg-border-subtle hover:text-fg-prominent'
      }`}
      style={{ fontSize: '0.85rem' }}
    >
      {note.isPdf && <FilePdf size={12} weight="regular" className="shrink-0 text-accent-link-broken" />}
      {note.isCanvas && <Stack size={12} weight="regular" className="shrink-0" />}
      <span className="truncate">
        {note.isPdf && <PdfSize bytes={note.sizeBytes} />}
        {note.title}
      </span>
    </button>
  );
}
