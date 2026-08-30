import type Database from '@tauri-apps/plugin-sql';

export interface SearchResult {
  id: string;
  title: string;
  path: string;
  snippet: string;
}

/**
 * Builds a safe FTS5 MATCH expression from free-text input: each token is
 * quoted (so stray FTS operators/punctuation the user types can't produce a
 * MATCH syntax error) and the last token gets a prefix wildcard, for
 * as-you-type results before the final word is finished. Tokens are
 * implicitly ANDed by FTS5.
 */
export function buildFtsQuery(input: string): string | null {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  return tokens
    .map((token, index) => {
      const escaped = token.replace(/"/g, '""');
      const isLast = index === tokens.length - 1;
      return isLast ? `"${escaped}"*` : `"${escaped}"`;
    })
    .join(' ');
}

/**
 * Title-weighted full-text search. bm25()'s weight arguments are positional
 * over *every* declared column of the fts5 table, including UNINDEXED ones
 * (unlike MATCH, which only searches indexed columns) — `notes_fts` is
 * declared `id UNINDEXED, title, body, tags`, so this passes one weight per
 * column in that order (id's is irrelevant since it can't match anything,
 * but omitting it would shift every other weight one column to the left).
 */
export async function searchNotes(db: Database, query: string, limit = 30): Promise<SearchResult[]> {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  return db.select<SearchResult[]>(
    `SELECT n.id, n.title, n.path,
            snippet(notes_fts, 2, '', '', '…', 10) as snippet,
            bm25(notes_fts, 0.0, 5.0, 1.0, 1.0) as rank
     FROM notes_fts
     JOIN notes n ON n.id = notes_fts.id
     WHERE notes_fts MATCH ? AND n.is_deleted = 0
     ORDER BY rank
     LIMIT ?`,
    [ftsQuery, limit],
  );
}
