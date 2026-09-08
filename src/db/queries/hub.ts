import type Database from '@tauri-apps/plugin-sql';

export interface HubNoteEntry {
  id: string;
  path: string;
  title: string;
  created: string;
  modified: string;
  wordCount: number;
  tags: string[];
  /** Total incoming links, vault-wide — same semantics as BacklinksPanel. */
  backlinkCount: number;
  excerpt: string;
  /** Zero incoming links from another note within this hub's own scope
   *  (distinct from backlinkCount, which is vault-wide). */
  isOrphan: boolean;
}

export interface HubStats {
  noteCount: number;
  totalWords: number;
  unresolvedLinkCount: number;
  lastUpdated: string | null;
}

export interface HubScopeOptions {
  /** Vault-relative folder path; '' scopes to the vault root. */
  folder: string;
  recursive: boolean;
}

/**
 * Path-prefix scoping — there's no folder table anywhere in this schema
 * (folderEngine.ts confirms folders are purely derived from path strings).
 * Recursive matches anything under the prefix; non-recursive additionally
 * excludes a second '/' so only immediate children match.
 */
export function scopeClause(folder: string, recursive: boolean): { sql: string; params: string[] } {
  if (folder === '') {
    return recursive ? { sql: '1=1', params: [] } : { sql: "path NOT LIKE '%/%'", params: [] };
  }
  const prefix = `${folder}/`;
  return recursive
    ? { sql: 'path LIKE ?', params: [`${prefix}%`] }
    : { sql: 'path LIKE ? AND path NOT LIKE ?', params: [`${prefix}%`, `${prefix}%/%`] };
}

interface HubNoteRow {
  id: string;
  path: string;
  title: string;
  created: string;
  modified: string;
  word_count: number;
  tags: string | null;
  backlink_count: number;
  in_scope_backlinks: number;
  excerpt: string | null;
}

/**
 * Notes in scope, each with tags, a vault-wide backlink count, an in-scope
 * backlink count (used only for orphan detection — a note linked to solely
 * from outside this hub's folder still counts as an orphan of this hub), and
 * an excerpt pulled straight from notes_fts.body (no MATCH needed — a plain
 * SELECT works on an fts5 column; search.ts's snippet() usage confirms body
 * is stored verbatim there). `excludePath` keeps a hub note nested inside its
 * own scope from listing itself.
 */
export async function getHubNotes(
  db: Database,
  scope: HubScopeOptions,
  excludePath: string,
): Promise<HubNoteEntry[]> {
  const { sql: scopeSql, params: scopeParams } = scopeClause(scope.folder, scope.recursive);
  const scopedToSource = scopeSql.replace(/\bpath\b/g, 'src.path');

  const rows = await db.select<HubNoteRow[]>(
    `SELECT n.id, n.path, n.title, n.created, n.modified, n.word_count,
            (SELECT GROUP_CONCAT(t.name, ',') FROM note_tags nt
             JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id) AS tags,
            (SELECT COUNT(*) FROM links l WHERE l.target_id = n.id) AS backlink_count,
            (SELECT COUNT(*) FROM links l
             JOIN notes src ON src.id = l.source_id AND src.is_deleted = 0 AND (${scopedToSource})
             WHERE l.target_id = n.id) AS in_scope_backlinks,
            substr((SELECT body FROM notes_fts WHERE id = n.id), 1, 200) AS excerpt
     FROM notes n
     WHERE n.is_deleted = 0 AND n.path != ? AND (${scopeSql})
     ORDER BY n.modified DESC`,
    [...scopeParams, excludePath, ...scopeParams],
  );

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    title: row.title,
    created: row.created,
    modified: row.modified,
    wordCount: row.word_count,
    tags: row.tags ? row.tags.split(',') : [],
    backlinkCount: row.backlink_count,
    excerpt: row.excerpt ?? '',
    isOrphan: row.in_scope_backlinks === 0,
  }));
}

/** Vault-wide-shaped aggregate stats, scoped the same way as getHubNotes.
 *  Unresolved-link count mirrors getUnresolvedLinkGroups's target_id IS NULL
 *  semantics (links.ts), restricted to notes whose source lives in scope. */
export async function getHubStats(
  db: Database,
  scope: HubScopeOptions,
  excludePath: string,
): Promise<HubStats> {
  const { sql: scopeSql, params: scopeParams } = scopeClause(scope.folder, scope.recursive);

  const [agg] = await db.select<{ note_count: number; total_words: number; last_updated: string | null }[]>(
    `SELECT COUNT(*) AS note_count, COALESCE(SUM(word_count), 0) AS total_words, MAX(modified) AS last_updated
     FROM notes WHERE is_deleted = 0 AND path != ? AND (${scopeSql})`,
    [excludePath, ...scopeParams],
  );
  const [unresolved] = await db.select<{ unresolved_count: number }[]>(
    `SELECT COUNT(*) AS unresolved_count FROM links l
     JOIN notes n ON n.id = l.source_id AND n.is_deleted = 0
     WHERE l.target_id IS NULL AND n.path != ? AND (${scopeSql})`,
    [excludePath, ...scopeParams],
  );

  return {
    noteCount: agg.note_count,
    totalWords: agg.total_words,
    unresolvedLinkCount: unresolved.unresolved_count,
    lastUpdated: agg.last_updated,
  };
}

/** The folder's own hub note, if it has one — a folder has at most one (see
 *  FolderNode.hub in folderTree.ts). Used by folderEngine.ts to keep a hub's
 *  filename in sync when its folder is renamed. */
export async function getFolderHub(db: Database, folderPath: string): Promise<{ id: string; title: string } | null> {
  const { sql, params } = scopeClause(folderPath, false);
  const rows = await db.select<{ id: string; title: string }[]>(
    `SELECT id, title FROM notes WHERE is_deleted = 0 AND is_hub = 1 AND (${sql}) LIMIT 1`,
    params,
  );
  return rows[0] ?? null;
}

export interface HubGraphEdge {
  sourceId: string;
  targetId: string;
}

/**
 * Synthetic graph edges from each hub note to every note currently in its
 * scope — these aren't stored in `links` (a hub's body carries no literal
 * `[[wikilinks]]`, just a config block), so the graph would otherwise show
 * every hub as an isolated node despite it conceptually "linking to" its
 * whole scope. Computed fresh each call from the small number of hub notes
 * (hub_folder/hub_recursive, set at sync time) rather than needing its own
 * cached table.
 */
export async function getHubGraphEdges(db: Database): Promise<HubGraphEdge[]> {
  const hubs = await db.select<{ id: string; path: string; hub_folder: string | null; hub_recursive: number }[]>(
    'SELECT id, path, hub_folder, hub_recursive FROM notes WHERE is_deleted = 0 AND is_hub = 1',
  );

  const edges: HubGraphEdge[] = [];
  for (const hub of hubs) {
    const folder = hub.hub_folder ?? '';
    const { sql, params } = scopeClause(folder, hub.hub_recursive === 1);
    const members = await db.select<{ id: string }[]>(
      `SELECT id FROM notes WHERE is_deleted = 0 AND path != ? AND (${sql})`,
      [hub.path, ...params],
    );
    for (const member of members) {
      edges.push({ sourceId: hub.id, targetId: member.id });
    }
  }
  return edges;
}
