import { useState } from 'react';
import { useSearch } from './useSearch';

interface SearchPanelProps {
  vaultRoot: string;
  /** Called with a vault-relative path when a result is chosen. */
  onSelect: (path: string) => void;
}

export function SearchPanel({ vaultRoot, onSelect }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const results = useSearch(vaultRoot, query);

  return (
    <div className="flex flex-col gap-1">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="search…"
        className="border border-border bg-transparent px-2 py-1 text-fg-prominent outline-none transition-colors duration-panel ease-panel focus:border-border-strong"
        style={{ fontSize: '0.82rem' }}
      />
      {query.trim() && (
        <div className="flex flex-col gap-0.5">
          {results.length === 0 ? (
            <span className="px-1 text-fg-faint" style={{ fontSize: '0.72rem' }}>
              no results
            </span>
          ) : (
            results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => onSelect(result.path)}
                className="flex flex-col items-start px-1 py-0.5 text-left"
              >
                <span className="truncate text-fg-prominent" style={{ fontSize: '0.82rem' }}>
                  {result.title}
                </span>
                {result.snippet && (
                  <span className="truncate text-fg-faint" style={{ fontSize: '0.68rem' }}>
                    {result.snippet}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
