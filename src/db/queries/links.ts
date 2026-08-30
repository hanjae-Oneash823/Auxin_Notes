import type Database from '@tauri-apps/plugin-sql';

export interface BacklinkEntry {
  id: string;
  title: string;
  path: string;
}

export async function getBacklinks(db: Database, noteId: string): Promise<BacklinkEntry[]> {
  return db.select<BacklinkEntry[]>(
    `SELECT DISTINCT n.id, n.title, n.path FROM links l
     JOIN notes n ON n.id = l.source_id
     WHERE l.target_id = ? AND n.is_deleted = 0
     ORDER BY n.title`,
    [noteId],
  );
}

export interface UnresolvedLinkGroup {
  targetRaw: string;
  referencingCount: number;
}

/** Distinct raw `[[text]]` targets that currently resolve to nothing
 *  (`links.target_id IS NULL` — covers both genuinely broken and merely
 *  ambiguous targets; see aliasResolution.ts for telling them apart). */
export async function getUnresolvedLinkGroups(db: Database): Promise<UnresolvedLinkGroup[]> {
  const rows = await db.select<{ target_raw: string; referencing_count: number }[]>(
    `SELECT l.target_raw as target_raw, COUNT(DISTINCT l.source_id) as referencing_count
     FROM links l
     JOIN notes n ON n.id = l.source_id
     WHERE l.target_id IS NULL AND n.is_deleted = 0
     GROUP BY l.target_raw
     ORDER BY l.target_raw`,
  );
  return rows.map((row) => ({ targetRaw: row.target_raw, referencingCount: row.referencing_count }));
}

export interface LinkReference {
  path: string;
  title: string;
}

export async function getReferencingNotes(db: Database, targetRaw: string): Promise<LinkReference[]> {
  return db.select<LinkReference[]>(
    `SELECT DISTINCT n.path, n.title FROM links l
     JOIN notes n ON n.id = l.source_id
     WHERE l.target_raw = ? AND n.is_deleted = 0
     ORDER BY n.title`,
    [targetRaw],
  );
}
