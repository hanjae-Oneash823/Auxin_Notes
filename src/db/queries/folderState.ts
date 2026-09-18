import type Database from '@tauri-apps/plugin-sql';

const COLLAPSED_FOLDERS_KEY = 'collapsed_folders';

/** Reads the sidebar's persisted collapsed-folder set (FolderTree.tsx) out
 *  of the generic `meta` key/value table — one JSON array under a single
 *  key, not a dedicated table, since this is a small, single-reader blob of
 *  UI state rather than queryable data. Malformed/missing JSON (a fresh
 *  vault, or a row from before this existed) falls back to "nothing
 *  collapsed" rather than throwing. */
export async function getCollapsedFolders(db: Database): Promise<string[]> {
  const rows = await db.select<{ value: string }[]>('SELECT value FROM meta WHERE key = ?', [
    COLLAPSED_FOLDERS_KEY,
  ]);
  if (rows.length === 0) return [];
  try {
    const parsed = JSON.parse(rows[0].value);
    return Array.isArray(parsed) ? parsed.filter((path): path is string => typeof path === 'string') : [];
  } catch {
    return [];
  }
}

export async function setCollapsedFolders(db: Database, paths: string[]): Promise<void> {
  await db.execute(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [COLLAPSED_FOLDERS_KEY, JSON.stringify(paths)],
  );
}
