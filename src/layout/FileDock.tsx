import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { NoteSummary } from '../db/queries/notes';
import { FileCard } from './FileCard';

interface FileDockProps {
  files: NoteSummary[];
  /** Vault-relative path of the open tab, to highlight its card. */
  activePath: string | null;
  /** `source` is the clicked card, for the fly-to-tab animation. */
  onSelect: (path: string, source?: HTMLElement) => void;
  /** The card's leading icon. */
  icon: ReactNode;
  searchPlaceholder: string;
  /** Shown when `files` is empty. */
  emptyText: string;
  /** Shown when the search matches nothing. */
  noMatchText: string;
  /** Rendered just before a card's name (e.g. a file size). */
  renderNamePrefix?: (file: NoteSummary) => ReactNode;
}

/** Searchable flat list of vault files (the folder tree only shows them inside
 *  their folders), alphabetical. Each is a two-line card: file name, then the
 *  folder it lives in. Search matches name or folder. */
export function FileDock({ files, activePath, onSelect, icon, searchPlaceholder, emptyText, noMatchText, renderNamePrefix }: FileDockProps) {
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const needle = query.trim().toLowerCase();
  const shown = [...files]
    .sort((a, b) => a.title.localeCompare(b.title))
    .filter((file) => !needle || file.path.toLowerCase().includes(needle));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && shown[0]) {
            onSelect(shown[0].path, listRef.current?.querySelector('button') ?? undefined);
          }
        }}
        placeholder={searchPlaceholder}
        className="mx-1 mb-2 shrink-0 rounded-row bg-bg px-2 py-1 text-fg-prominent outline-none placeholder:text-fg-faint"
        style={{ fontSize: '0.8rem' }}
      />
      <div ref={listRef} className="sidebar-scroll relative -mr-3.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-2.5">
        {shown.length === 0 && (
          <span className="px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
            {files.length === 0 ? emptyText : noMatchText}
          </span>
        )}
        {/* popLayout: leaving cards fade out in place while the rest slide up to fill the gap. */}
        <AnimatePresence mode="popLayout">
        {shown.map((file, index) => (
          <FileCard
            key={file.path}
            file={file}
            index={index}
            isActive={activePath === file.path}
            onSelect={onSelect}
            icon={icon}
            namePrefix={renderNamePrefix?.(file)}
          />
        ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
