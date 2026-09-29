import type Database from '@tauri-apps/plugin-sql';

export interface NoteSummary {
  id: string;
  path: string;
  title: string;
  modified: string;
  /** Frontmatter failed to parse — indexed as title/path only. */
  needsAttention: boolean;
  /** Body contains a parseable ```hub fenced config block — see parseHubBlock.ts. */
  isHub: boolean;
  /** Path ends in `.axcanvas` — see parseCanvas.ts. Mutually exclusive with `isHub`. */
  isCanvas: boolean;
  /** A `.pdf` file, listed from disk rather than the index (see pdf/pdfFiles.ts). */
  isPdf: boolean;
  /** File size in bytes; only set on PDFs (from the disk listing). */
  sizeBytes?: number;
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
  is_hub: number;
  is_canvas: number;
}

function toSummary(row: NoteRow): NoteSummary {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    modified: row.modified,
    needsAttention: row.needs_attention === 1,
    isHub: row.is_hub === 1,
    isCanvas: row.is_canvas === 1,
    isPdf: false,
  };
}

export async function listNotes(db: Database, options: ListNotesOptions = {}): Promise<NoteSummary[]> {
  const rows = options.tag
    ? await db.select<NoteRow[]>(
        `SELECT n.id, n.path, n.title, n.modified, n.needs_attention, n.is_hub, n.is_canvas FROM notes n
         JOIN note_tags nt ON nt.note_id = n.id
         JOIN tags t ON t.id = nt.tag_id
         WHERE n.is_deleted = 0 AND t.name = ?
         ORDER BY n.modified DESC`,
        [options.tag],
      )
    : await db.select<NoteRow[]>(
        'SELECT id, path, title, modified, needs_attention, is_hub, is_canvas FROM notes WHERE is_deleted = 0 ORDER BY modified DESC',
      );

  return rows.map(toSummary);
}
