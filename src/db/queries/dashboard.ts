import type Database from '@tauri-apps/plugin-sql';

/** Local-time bounds for the "day" half of the day/night split in
 *  getVaultStats — [DAY_START_HOUR, DAY_END_HOUR) counts as day, everything
 *  else as night. */
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 18;

export interface RecentNoteEntry {
  id: string;
  path: string;
  title: string;
  modified: string;
  tags: string[];
  excerpt: string;
  isHub: boolean;
  isCanvas: boolean;
}

export interface TopLinkedNote {
  id: string;
  path: string;
  title: string;
  backlinkCount: number;
}

interface RecentNoteRow {
  id: string;
  path: string;
  title: string;
  modified: string;
  tags: string | null;
  excerpt: string | null;
  is_hub: number;
  is_canvas: number;
}

/**
 * The Home dashboard's "recent" list — richer than listNotes (notes.ts):
 * each row carries its tags and a short body excerpt, the same shape
 * getHubNotes (hub.ts) gives a folder's notes, but vault-wide and capped at
 * `limit` rather than scoped to a folder. Hub and canvas notes carry no
 * excerpt — a hub's body is just its ```hub config block, and a canvas's is
 * raw JSON, neither of which reads as prose.
 */
export async function getRecentNotesRich(db: Database, limit: number): Promise<RecentNoteEntry[]> {
  const rows = await db.select<RecentNoteRow[]>(
    `SELECT n.id, n.path, n.title, n.modified, n.is_hub, n.is_canvas,
            (SELECT GROUP_CONCAT(t.name, ',') FROM note_tags nt
             JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id) AS tags,
            substr((SELECT body FROM notes_fts WHERE id = n.id), 1, 320) AS excerpt
     FROM notes n
     WHERE n.is_deleted = 0
     ORDER BY n.modified DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    title: row.title,
    modified: row.modified,
    tags: row.tags ? row.tags.split(',') : [],
    excerpt: row.is_hub === 1 || row.is_canvas === 1 ? '' : (row.excerpt ?? ''),
    isHub: row.is_hub === 1,
    isCanvas: row.is_canvas === 1,
  }));
}

/**
 * Vault-wide "most-linked" notes — same backlink_count semantics as
 * HubNoteEntry.backlinkCount (hub.ts) and BacklinksPanel, just ranked
 * instead of scoped to a folder. Notes with zero backlinks are excluded
 * (filtered in SQL, not after LIMIT, so a full `limit` of linked notes comes
 * back rather than being crowded out by zero-backlink ties).
 */
export async function getTopLinkedNotes(db: Database, limit: number): Promise<TopLinkedNote[]> {
  const rows = await db.select<{ id: string; path: string; title: string; backlink_count: number }[]>(
    `SELECT * FROM (
       SELECT n.id, n.path, n.title,
              (SELECT COUNT(*) FROM links l WHERE l.target_id = n.id) AS backlink_count
       FROM notes n
       WHERE n.is_deleted = 0
     )
     WHERE backlink_count > 0
     ORDER BY backlink_count DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    title: row.title,
    backlinkCount: row.backlink_count,
  }));
}

export interface VaultStats {
  totalWords: number;
  oldestNote: { title: string; created: string } | null;
  longestNote: { title: string; wordCount: number } | null;
  dayNoteCount: number;
  nightNoteCount: number;
  totalLinkCount: number;
}

/**
 * The Home dashboard's "fun facts" figures: total word count, the oldest
 * and longest surviving notes, a day-vs-night writing tally, and the total
 * number of links across the vault. The day/night split is computed here
 * from each note's `modified` timestamp with JS's Date.getHours() (local
 * time) rather than SQL's strftime('%H', ...), which reads UTC and would
 * misclassify every note for a vault owner not in UTC.
 */
export async function getVaultStats(db: Database): Promise<VaultStats> {
  const [totalsRow] = await db.select<{ total_words: number }[]>(
    `SELECT COALESCE(SUM(word_count), 0) AS total_words FROM notes WHERE is_deleted = 0`,
  );
  const [oldestRow] = await db.select<{ title: string; created: string }[]>(
    `SELECT title, created FROM notes WHERE is_deleted = 0 ORDER BY created ASC LIMIT 1`,
  );
  const [longestRow] = await db.select<{ title: string; word_count: number }[]>(
    `SELECT title, word_count FROM notes WHERE is_deleted = 0 ORDER BY word_count DESC LIMIT 1`,
  );
  const modifiedRows = await db.select<{ modified: string }[]>(
    `SELECT modified FROM notes WHERE is_deleted = 0`,
  );
  // Same source-note-not-deleted join as getBacklinks/getUnresolvedLinkGroups
  // (links.ts) — a link from a deleted note shouldn't count toward the
  // vault's live total.
  const [linkCountRow] = await db.select<{ total_links: number }[]>(
    `SELECT COUNT(*) AS total_links FROM links l JOIN notes n ON n.id = l.source_id WHERE n.is_deleted = 0`,
  );

  let dayNoteCount = 0;
  let nightNoteCount = 0;
  for (const row of modifiedRows) {
    const hour = new Date(row.modified).getHours();
    if (hour >= DAY_START_HOUR && hour < DAY_END_HOUR) {
      dayNoteCount += 1;
    } else {
      nightNoteCount += 1;
    }
  }

  return {
    totalWords: totalsRow?.total_words ?? 0,
    oldestNote: oldestRow ? { title: oldestRow.title, created: oldestRow.created } : null,
    longestNote: longestRow ? { title: longestRow.title, wordCount: longestRow.word_count } : null,
    dayNoteCount,
    nightNoteCount,
    totalLinkCount: linkCountRow?.total_links ?? 0,
  };
}
