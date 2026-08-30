import { useEffect, useState } from 'react';
import { getDb } from '../db/client';
import { searchNotes, type SearchResult } from '../db/queries/search';

const DEBOUNCE_MS = 150;

/** Debounced FTS5 search against the currently open vault. Returns an empty
 *  result set (not stale results) for a blank query. */
export function useSearch(vaultRoot: string, query: string): SearchResult[] {
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        const db = await getDb(vaultRoot);
        const rows = await searchNotes(db, query);
        if (!cancelled) setResults(rows);
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [vaultRoot, query]);

  return results;
}
