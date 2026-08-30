import type Database from '@tauri-apps/plugin-sql';

export type LinkResolutionStatus = 'resolved' | 'stale' | 'ambiguous' | 'broken';

export interface LinkCandidate {
  id: string;
  path: string;
  title: string;
}

export interface LinkResolution {
  targetId: string | null;
  status: LinkResolutionStatus;
  /** The matching note(s): one for 'resolved'/'stale', several for
   *  'ambiguous', empty for 'broken'. Lets UI (e.g. a chip's click-to-relink
   *  or click-to-disambiguate affordance) show a candidate's current title
   *  and path without a second query. */
  candidates: LinkCandidate[];
}

const RESOLVED_NONE: LinkResolution = { targetId: null, status: 'broken', candidates: [] };

/**
 * Single source of truth for turning a raw `[[target]]` string into a note,
 * shared by index-time link resolution (syncEngine) and live editor UI
 * (link chips, autocomplete) so the two never diverge on what counts as
 * resolved/ambiguous/broken.
 *
 * Resolution order:
 * 1. Path-qualified target ("Subfolder/Title") — the portable, git-diffable
 *    way a user (or the disambiguation UI) pins an otherwise-ambiguous link
 *    to one specific note, entirely within the file's own text.
 * 2. Plain title match against current notes.
 * 3. `note_aliases` fallback — a title that belonged to a note before a
 *    rename still resolves for one cycle ('stale': works, but a rename
 *    propagation pass would clean it up).
 */
export async function resolveLinkTarget(db: Database, targetRaw: string): Promise<LinkResolution> {
  const trimmed = targetRaw.trim();
  if (!trimmed) return RESOLVED_NONE;

  if (trimmed.includes('/')) {
    const byPath = await resolveByPath(db, trimmed);
    if (byPath) return byPath;
    // No path match — could just be a title that happens to contain a
    // slash (e.g. a tag-like title). Fall through to title/alias matching.
  }

  const byTitle = await db.select<LinkCandidate[]>(
    'SELECT id, path, title FROM notes WHERE is_deleted = 0 AND title = ?',
    [trimmed],
  );
  if (byTitle.length === 1) return { targetId: byTitle[0].id, status: 'resolved', candidates: byTitle };
  if (byTitle.length > 1) return { targetId: null, status: 'ambiguous', candidates: byTitle };

  const byAlias = await db.select<LinkCandidate[]>(
    `SELECT n.id, n.path, n.title FROM note_aliases a
     JOIN notes n ON n.id = a.note_id AND n.is_deleted = 0
     WHERE a.old_title = ?`,
    [trimmed],
  );
  if (byAlias.length === 1) return { targetId: byAlias[0].id, status: 'stale', candidates: byAlias };
  if (byAlias.length > 1) return { targetId: null, status: 'ambiguous', candidates: byAlias };

  return RESOLVED_NONE;
}

async function resolveByPath(db: Database, pathTarget: string): Promise<LinkResolution | null> {
  const suffix = pathTarget.endsWith('.md') ? pathTarget : `${pathTarget}.md`;
  const rows = await db.select<LinkCandidate[]>(
    'SELECT id, path, title FROM notes WHERE is_deleted = 0 AND (path = ? OR path LIKE ?)',
    [suffix, `%/${suffix}`],
  );
  if (rows.length === 1) return { targetId: rows[0].id, status: 'resolved', candidates: rows };
  if (rows.length > 1) return { targetId: null, status: 'ambiguous', candidates: rows };
  return null;
}

/** Vault-relative path with the `.md` extension stripped, for use as a
 *  path-qualified disambiguator in link text (e.g. "Subfolder/Title"). */
export function pathQualifiedTarget(path: string): string {
  return path.replace(/\.md$/, '');
}
