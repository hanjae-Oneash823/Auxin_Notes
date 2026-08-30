import type Database from '@tauri-apps/plugin-sql';

export interface NoteSummary {
  id: string;
  path: string;
  title: string;
  modified: string;
  /** Frontmatter failed to parse — indexed as title/path only. */
  needsAttention: boolean;
}

export interface ListNotesOptions {
  /** Restrict to notes carrying this tag (see tags.ts / note_tags). */
  tag?: string;
}

interface NoteRow {
  id: string;
  path: string;
  title: string;
  modified: string;
  needs_attention: number;
}

function toSummary(row: NoteRow): NoteSummary {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    modified: row.modified,
    needsAttention: row.needs_attention === 1,
  };
}

export async function listNotes(db: Database, options: ListNotesOptions = {}): Promise<NoteSummary[]> {
  const rows = options.tag
    ? await db.select<NoteRow[]>(
        `SELECT n.id, n.path, n.title, n.modified, n.needs_attention FROM notes n
         JOIN note_tags nt ON nt.note_id = n.id
         JOIN tags t ON t.id = nt.tag_id
         WHERE n.is_deleted = 0 AND t.name = ?
         ORDER BY n.modified DESC`,
        [options.tag],
      )
    : await db.select<NoteRow[]>(
        'SELECT id, path, title, modified, needs_attention FROM notes WHERE is_deleted = 0 ORDER BY modified DESC',
      );

  return rows.map(toSummary);
}
