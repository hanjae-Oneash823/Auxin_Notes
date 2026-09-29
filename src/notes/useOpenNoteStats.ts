import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '../vault/vaultStore';
import { computeNoteStats, type NoteStats } from './noteStats';

/** Wait for edits to settle (watcher syncs arrive in bursts) before re-reading. */
const STATS_REFRESH_DEBOUNCE_MS = 400;

/**
 * Word/image stats for the given absolute note paths, computed from each
 * file's text (note bodies aren't in the index — see 0001_init.sql). Only the
 * handful of open tabs are read, so this stays cheap. Refreshes when the set
 * of paths changes, after a vault sync (an edit was saved), and when
 * `refreshKey` changes (e.g. the active tab, so a switch always shows fresh
 * numbers). A file that can't be read is logged and left out.
 */
export function useOpenNoteStats(paths: string[], refreshKey: string): ReadonlyMap<string, NoteStats> {
  const syncVersion = useVaultStore((state) => state.syncVersion);
  const [stats, setStats] = useState<ReadonlyMap<string, NoteStats>>(new Map());
  const pathsKey = paths.join('\n');

  useEffect(() => {
    let isCancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all(
        paths.map(async (path): Promise<[string, NoteStats] | null> => {
          try {
            const raw = await invoke<string>('read_note', { path });
            return [path, computeNoteStats(raw)];
          } catch (error: unknown) {
            console.error(`Failed to read note for tab stats: ${path}`, error);
            return null;
          }
        }),
      ).then((entries) => {
        if (isCancelled) return;
        setStats(new Map(entries.filter((entry): entry is [string, NoteStats] => entry !== null)));
      });
    }, STATS_REFRESH_DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
    // `paths` is covered by `pathsKey`; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey, syncVersion, refreshKey]);

  return stats;
}
