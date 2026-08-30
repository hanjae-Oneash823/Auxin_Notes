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
        className="w-full border border-border-strong bg-transparent px-1 text-left text-fg-prominent outline-none"
        style={{ fontSize: '0.85rem' }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onStartRename}
      title={note.needsAttention ? 'frontmatter could not be parsed — needs attention' : undefined}
      className={`flex w-full items-center gap-1 truncate border-l-2 px-1 text-left transition-colors duration-panel ease-panel ${
        isActive
          ? 'border-accent-link text-fg-prominent'
          : 'border-transparent text-fg-muted hover:text-fg-prominent'
      }`}
      style={{ fontSize: '0.85rem' }}
    >
      {note.needsAttention && <span className="text-accent-link-broken">•</span>}
      <span className="truncate">{note.title}</span>
    </button>
  );
}
