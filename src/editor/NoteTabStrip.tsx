import { useState, type KeyboardEvent } from 'react';
import { X } from '@phosphor-icons/react';

interface NoteTabStripProps {
  names: readonly string[];
  activeIndex: number;
  readOnly: boolean;
  onSelect: (index: number) => void;
  onRename: (index: number, name: string) => void;
  onDelete: (index: number) => void;
}

/** One row of the note's tabs. Double-click renames; × asks twice before deleting a tab and its text. */
export function NoteTabStrip({ names, activeIndex, readOnly, onSelect, onRename, onDelete }: NoteTabStripProps) {
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);

  function commitRename(index: number, value: string) {
    setRenamingIndex(null);
    if (value.trim()) onRename(index, value);
  }

  function handleRenameKey(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Enter') commitRename(index, event.currentTarget.value);
    else if (event.key === 'Escape') setRenamingIndex(null);
  }

  return (
    <div
      role="tablist"
      className="mx-auto flex w-full items-center gap-1 overflow-x-auto"
      style={{
        // Same column as the title and .cm-content (see Editor.tsx).
        maxWidth: 'min(var(--width-content-max), calc(100% - 2 * var(--space-toc-gutter)))',
        padding: '0 var(--space-content-lg)',
      }}
    >
      {names.map((name, index) => {
        const isActive = index === activeIndex;
        return (
          <div
            key={index}
            role="tab"
            aria-selected={isActive}
            className={`group flex shrink-0 items-center gap-1 rounded px-2 py-1 text-sm transition-colors duration-panel ease-panel ${
              isActive ? 'bg-hover text-fg' : 'text-fg-faint hover:text-fg-prominent'
            }`}
            onClick={() => {
              setPendingDeleteIndex(null);
              onSelect(index);
            }}
            onDoubleClick={() => {
              if (!readOnly) setRenamingIndex(index);
            }}
          >
            {renamingIndex === index ? (
              <input
                autoFocus
                defaultValue={name}
                onBlur={(event) => commitRename(index, event.currentTarget.value)}
                onKeyDown={(event) => handleRenameKey(event, index)}
                className="w-24 bg-transparent text-fg outline-none"
              />
            ) : (
              <span>{name}</span>
            )}
            {!readOnly && isActive && renamingIndex !== index && (
              <button
                type="button"
                title={pendingDeleteIndex === index ? 'Click again to delete this tab and its text' : 'Delete tab'}
                onClick={(event) => {
                  event.stopPropagation();
                  if (pendingDeleteIndex === index) {
                    setPendingDeleteIndex(null);
                    onDelete(index);
                  } else {
                    setPendingDeleteIndex(index);
                  }
                }}
                onBlur={() => setPendingDeleteIndex(null)}
                className={pendingDeleteIndex === index ? 'text-accent-warning' : 'text-fg-faint hover:text-fg-prominent'}
              >
                <X size={12} weight={pendingDeleteIndex === index ? 'bold' : 'regular'} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
