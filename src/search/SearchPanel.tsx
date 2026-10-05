import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FilePdf, FileText, Stack } from '@phosphor-icons/react';
import type { NoteSummary } from '../db/queries/notes';
import { searchWords } from '../canvas/cardSearch';
import { FileCard } from '../layout/FileCard';
import { groupSearchResults } from './searchGroups';
import { useSearch } from './useSearch';

interface SearchPanelProps {
  vaultRoot: string;
  /** Every vault file — notes, canvases and PDFs — for the Folder and Title groups. */
  files: readonly NoteSummary[];
  /** Vault-relative path of the open tab, to highlight its card. */
  activePath: string | null;
  /** Called with a vault-relative path when a result is chosen. */
  onSelect: (path: string) => void;
}

function FileIcon({ file }: { file: NoteSummary }) {
  if (file.isPdf) return <FilePdf size={15} className="shrink-0 text-accent-link-broken" />;
  if (file.isCanvas) return <Stack size={15} className="shrink-0 text-accent-link" />;
  return <FileText size={15} className="shrink-0" />;
}

/** Search results as the dock-style file cards, grouped by what matched: Title, Contents, Folder. */
export function SearchPanel({ vaultRoot, files, activePath, onSelect }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const contentHits = useSearch(vaultRoot, query);
  const groups = useMemo(() => groupSearchResults(files, contentHits, query), [files, contentHits, query]);
  const words = useMemo(() => searchWords(query), [query]);
  const firstPath = groups[0]?.hits[0]?.file.path;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <input
        autoFocus
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && firstPath && onSelect(firstPath)}
        placeholder="search titles, contents, folders"
        className="mx-1 mb-2 shrink-0 rounded-row bg-bg px-2 py-1 text-fg-prominent outline-none placeholder:text-fg-faint"
        style={{ fontSize: '0.8rem' }}
      />
      <div className="sidebar-scroll relative -mr-3.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-2.5">
        {query.trim() && groups.length === 0 && (
          <span className="px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>no results</span>
        )}
        {groups.map((group) => (
          <section key={group.id} className="flex flex-col gap-1">
            <h3 className="mt-2 flex items-baseline gap-1.5 px-1 font-semibold uppercase tracking-wide text-fg-faint" style={{ fontSize: '0.68rem' }}>
              {group.label}
              <span className="font-normal">{group.hits.length}</span>
            </h3>
            <AnimatePresence mode="popLayout">
              {group.hits.map(({ file, detail }, index) => (
                <FileCard
                  key={file.path}
                  file={file}
                  index={index}
                  isActive={activePath === file.path}
                  onSelect={(path) => onSelect(path)}
                  icon={<FileIcon file={file} />}
                  detail={detail}
                  words={words}
                />
              ))}
            </AnimatePresence>
          </section>
        ))}
      </div>
    </div>
  );
}
