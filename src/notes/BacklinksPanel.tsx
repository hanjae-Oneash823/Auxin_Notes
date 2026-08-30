import { useEffect, useState } from 'react';
import { getDb } from '../db/client';
import { getBacklinks, type BacklinkEntry } from '../db/queries/links';
import { useVaultStore } from '../vault/vaultStore';

interface BacklinksPanelProps {
  vaultRoot: string;
  noteId: string | null;
  /** Called with a vault-relative path when a backlink is chosen. */
  onSelect: (path: string) => void;
}

export function BacklinksPanel({ vaultRoot, noteId, onSelect }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<BacklinkEntry[]>([]);
  const syncVersion = useVaultStore((state) => state.syncVersion);

  useEffect(() => {
    if (!noteId) {
      setBacklinks([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const db = await getDb(vaultRoot);
      const rows = await getBacklinks(db, noteId);
      if (!cancelled) setBacklinks(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultRoot, noteId, syncVersion]);

  if (!noteId) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
        [backlinks]
      </span>
      {backlinks.length === 0 ? (
        <span className="px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
          no backlinks
        </span>
      ) : (
        backlinks.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onSelect(entry.path)}
            className="truncate px-1 text-left text-accent-link hover:text-fg-prominent"
            style={{ fontSize: '0.82rem' }}
          >
            {entry.title}
          </button>
        ))
      )}
    </div>
  );
}
