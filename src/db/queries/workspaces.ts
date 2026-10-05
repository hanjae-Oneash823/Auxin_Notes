import type Database from '@tauri-apps/plugin-sql';

const WORKSPACES_KEY = 'workspaces';

/** One workspace as stored: tabs are vault-relative (so the saved state
 *  follows the vault if it moves), Home is never included. */
export interface SavedWorkspace {
  name: string;
  tabs: string[];
  active: string | null;
  /** Absent in workspaces saved before colors existed. */
  color?: string | null;
  /** Vault-relative; absent in workspaces saved before flags existed. */
  flagged?: string[];
}

export interface SavedWorkspaces {
  workspaces: SavedWorkspace[];
  current: string | null;
}

/** Reads the workspaces out of the generic `meta` key/value table — one JSON
 *  blob under a single key, like the collapsed-folder sets in folderState.ts.
 *  Returns null for a vault that has none saved yet, or malformed JSON. */
export async function getSavedWorkspaces(db: Database): Promise<SavedWorkspaces | null> {
  const rows = await db.select<{ value: string }[]>('SELECT value FROM meta WHERE key = ?', [WORKSPACES_KEY]);
  if (rows.length === 0) return null;
  try {
    const parsed = JSON.parse(rows[0].value) as SavedWorkspaces;
    return Array.isArray(parsed.workspaces) ? parsed : null;
  } catch {
    return null;
  }
}

export async function setSavedWorkspaces(db: Database, saved: SavedWorkspaces): Promise<void> {
  await db.execute(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [WORKSPACES_KEY, JSON.stringify(saved)],
  );
}
