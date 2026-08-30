import { invoke } from '@tauri-apps/api/core';
import { ulid } from 'ulid';
import type Database from '@tauri-apps/plugin-sql';
import { getDb } from '../db/client';
import { parseFrontmatter } from './parseFrontmatter';
import { countWords, parseInlineTags, parseLinks } from './parseLinksAndTags';
import { pathQualifiedTarget, resolveLinkTarget } from './aliasResolution';
import type { ParsedNote } from './types';

/** Non-cryptographic hash, fast, sufficient for "did this file's bytes change." */
function hashContent(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function titleFromPath(path: string): string {
  const fileName = path.split('/').pop() ?? path;
  return fileName.replace(/\.md$/, '');
}

/**
 * Parses a note's raw file contents. Missing id/created/modified are filled
 * in with sane defaults (caller is responsible for writing them back to disk
 * — this function only ever reads, never writes).
 */
function parseNote(raw: string, path: string): ParsedNote {
  const { frontmatter, body, malformed } = parseFrontmatter(raw);
  const now = new Date().toISOString();

  return {
    frontmatter: {
      id: frontmatter.id ?? ulid(),
      created: frontmatter.created ?? now,
      modified: frontmatter.modified ?? now,
      tags: frontmatter.tags ?? [],
    },
    needsAttention: malformed,
    body,
    title: titleFromPath(path),
    wordCount: countWords(body),
    contentHash: hashContent(raw),
    links: parseLinks(body),
    tags: Array.from(new Set([...(frontmatter.tags ?? []), ...parseInlineTags(body)])),
  };
}

function serializeNote(note: ParsedNote): string {
  const tagsLine =
    note.frontmatter.tags.length > 0
      ? `tags: [${note.frontmatter.tags.join(', ')}]`
      : 'tags: []';
  return [
    '---',
    `id: ${note.frontmatter.id}`,
    `created: ${note.frontmatter.created}`,
    `modified: ${note.frontmatter.modified}`,
    tagsLine,
    '---',
    note.body,
  ].join('\n');
}

/**
 * Reads, parses, and indexes one absolute path inside the vault. Backfills
 * missing frontmatter (writing the file once if needed), then upserts
 * notes/tags/note_tags/links/notes_fts. Never throws on a single malformed
 * file — failures degrade to a `needsAttention` note rather than halting the
 * sync of everything else.
 */
export async function syncFile(vaultRoot: string, absolutePath: string): Promise<void> {
  const db = await getDb(vaultRoot);
  let raw: string;
  try {
    raw = await invoke<string>('read_note', { path: absolutePath });
  } catch {
    return; // file vanished between the change event and this read; the
    // remove path (syncRemoved) or the next reconciliation pass handles it
  }

  const note = parseNote(raw, absolutePath);

  // A frontmatter block can be present but still missing `id` (e.g.
  // hand-authored, or written by an external tool) — checking only for the
  // block's existence would skip backfilling the freshly-generated id here
  // to disk, so the *next* sync mints a different id for the same file and
  // collides with this one on the `path` UNIQUE constraint.
  const { frontmatter: rawFrontmatter } = parseFrontmatter(raw);
  const needsBackfill = !rawFrontmatter.id || !rawFrontmatter.created || !rawFrontmatter.modified;
  if (needsBackfill) {
    await invoke('write_note', { path: absolutePath, content: serializeNote(note) });
  }

  await upsertParsedNote(db, vaultRoot, absolutePath, note);
}

export async function syncRemoved(vaultRoot: string, absolutePath: string): Promise<void> {
  const db = await getDb(vaultRoot);
  const relativePath = toRelativePath(vaultRoot, absolutePath);
  await db.execute('UPDATE notes SET is_deleted = 1 WHERE path = ?', [relativePath]);
}

async function upsertParsedNote(
  db: Database,
  vaultRoot: string,
  absolutePath: string,
  note: ParsedNote,
): Promise<void> {
  const relativePath = toRelativePath(vaultRoot, absolutePath);
  const { id } = note.frontmatter;

  const existing = await db.select<{ id: string; path: string; title: string }[]>(
    'SELECT id, path, title FROM notes WHERE id = ?',
    [id],
  );

  if (existing.length > 0 && existing[0].path !== relativePath) {
    // Same id at a new path: an internal or external rename. Preserve the
    // old title as an alias so existing [[Old Title]] references still
    // resolve for one more cycle (see note_aliases in the schema).
    await db.execute('INSERT INTO note_aliases (note_id, old_title) VALUES (?, ?)', [
      id,
      existing[0].title,
    ]);
  }

  // A stale row can already occupy this path under a *different* id — e.g.
  // a previous sync generated an id that never made it to disk (a since-
  // fixed backfill gap) or two syncs raced on a brand-new file. The file's
  // own on-disk frontmatter id is authoritative; retire the stale row so
  // this insert doesn't collide with it on the `path` UNIQUE constraint.
  const stalePathRows = await db.select<{ id: string }[]>(
    'SELECT id FROM notes WHERE path = ? AND id != ?',
    [relativePath, id],
  );
  for (const stale of stalePathRows) {
    // `PRAGMA foreign_keys=ON` (db/client.ts) cascades this into
    // note_tags/links/note_aliases, but notes_fts is a virtual FTS5 table
    // with no real FK — it needs an explicit delete.
    await db.execute('DELETE FROM notes WHERE id = ?', [stale.id]);
    await db.execute('DELETE FROM notes_fts WHERE id = ?', [stale.id]);
  }

  await db.execute(
    `INSERT INTO notes (id, path, title, created, modified, content_hash, synced_at_ms, word_count, is_deleted, needs_attention)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       path = excluded.path,
       title = excluded.title,
       modified = excluded.modified,
       content_hash = excluded.content_hash,
       synced_at_ms = excluded.synced_at_ms,
       word_count = excluded.word_count,
       is_deleted = 0,
       needs_attention = excluded.needs_attention`,
    [
      id,
      relativePath,
      note.title,
      note.frontmatter.created,
      note.frontmatter.modified,
      note.contentHash,
      Date.now(),
      note.wordCount,
      note.needsAttention ? 1 : 0,
    ],
  );

  await syncTags(db, id, note.tags);
  await syncLinks(db, id, note.links);
  await syncFts(db, id, note.title, note.body, note.tags);
  await reresolveIncomingLinks(db, relativePath, note.title);
}

/**
 * A link recorded before its target note existed yet (e.g. during a
 * full-vault rebuild, if the referencing file happens to sync before the
 * one it points to) is left with `target_id IS NULL` and nothing ever
 * revisits it once the target shows up later in the same pass — this note
 * finishing its own sync is the trigger to re-check anything that was
 * specifically waiting on it.
 */
async function reresolveIncomingLinks(db: Database, relativePath: string, title: string): Promise<void> {
  const candidates = Array.from(new Set([title, pathQualifiedTarget(relativePath)]));
  const placeholders = candidates.map(() => '?').join(', ');
  const pending = await db.select<{ target_raw: string }[]>(
    `SELECT DISTINCT target_raw FROM links WHERE target_id IS NULL AND target_raw IN (${placeholders})`,
    candidates,
  );
  for (const { target_raw } of pending) {
    const { targetId } = await resolveLinkTarget(db, target_raw);
    if (targetId) {
      await db.execute('UPDATE links SET target_id = ? WHERE target_raw = ? AND target_id IS NULL', [
        targetId,
        target_raw,
      ]);
    }
  }
}

async function syncTags(db: Database, noteId: string, tags: string[]): Promise<void> {
  await db.execute('DELETE FROM note_tags WHERE note_id = ?', [noteId]);
  for (const tagName of tags) {
    await db.execute('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName]);
    const rows = await db.select<{ id: number }[]>('SELECT id FROM tags WHERE name = ?', [
      tagName,
    ]);
    if (rows.length > 0) {
      await db.execute('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', [
        noteId,
        rows[0].id,
      ]);
    }
  }
}

async function syncLinks(
  db: Database,
  noteId: string,
  links: { targetRaw: string; position: number }[],
): Promise<void> {
  await db.execute('DELETE FROM links WHERE source_id = ?', [noteId]);
  for (const link of links) {
    // Ambiguous (multiple candidates) and broken (zero candidates) both
    // leave target_id NULL rather than guessing (see plan §Risks); 'stale'
    // (resolved via note_aliases) still gets a real target_id — it works,
    // it just came from a pre-rename title.
    const { targetId } = await resolveLinkTarget(db, link.targetRaw);
    await db.execute(
      'INSERT INTO links (source_id, target_id, target_raw, position) VALUES (?, ?, ?, ?)',
      [noteId, targetId, link.targetRaw, link.position],
    );
  }
}

async function syncFts(
  db: Database,
  noteId: string,
  title: string,
  body: string,
  tags: string[],
): Promise<void> {
  await db.execute('DELETE FROM notes_fts WHERE id = ?', [noteId]);
  await db.execute('INSERT INTO notes_fts (id, title, body, tags) VALUES (?, ?, ?, ?)', [
    noteId,
    title,
    body,
    tags.join(' '),
  ]);
}

export function toRelativePath(vaultRoot: string, absolutePath: string): string {
  return absolutePath.startsWith(vaultRoot)
    ? absolutePath.slice(vaultRoot.length).replace(/^\/+/, '')
    : absolutePath;
}
