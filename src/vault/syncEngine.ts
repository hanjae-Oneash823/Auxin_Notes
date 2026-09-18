import { invoke } from '@tauri-apps/api/core';
import { ulid } from 'ulid';
import type Database from '@tauri-apps/plugin-sql';
import { getDb } from '../db/client';
import { dirname, titleFromPath } from './noteTitle';
import { extractLegacyFrontmatter } from './parseFrontmatter';
import { parseHubBlock } from './parseHubBlock';
import { CANVAS_EXTENSION } from './canvasTypes';
import { canvasLinks, canvasSearchableBody, parseCanvasDocument } from './parseCanvas';
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

interface ParseNoteResult {
  note: ParsedNote;
  /** Present only when a legacy frontmatter block carried an `id` — the
   *  caller passes this straight through to `upsertParsedNote` as a known
   *  id instead of letting `resolveNoteId` rediscover it via hash-matching. */
  legacyId: string | undefined;
  /** A legacy `---` block was found and stripped from `body` — the caller
   *  writes the cleaned body back to disk once. */
  strippedLegacyBlock: boolean;
}

/**
 * Parses a note's raw file contents. If a legacy frontmatter block is
 * present (every note written before this app stopped embedding one), its
 * `id`/`created` are extracted for identity resolution and the block itself
 * is stripped — `body` going forward is always frontmatter-free.
 */
function parseNote(raw: string, path: string): ParseNoteResult {
  const { legacy, body, found } = extractLegacyFrontmatter(raw);
  const now = new Date().toISOString();
  const hubConfig = parseHubBlock(body);

  const note: ParsedNote = {
    created: legacy.created ?? now,
    modified: now,
    body,
    title: titleFromPath(path),
    wordCount: countWords(body),
    contentHash: hashContent(body),
    links: parseLinks(body),
    tags: parseInlineTags(body),
    isHub: hubConfig !== null,
    hubFolder: hubConfig ? hubConfig.folder ?? dirname(path) : null,
    hubRecursive: hubConfig?.recursive ?? true,
    isCanvas: false,
  };

  return { note, legacyId: legacy.id, strippedLegacyBlock: found };
}

/**
 * Parses a `.axcanvas` file's raw JSON text into the same `ParsedNote` shape
 * `parseNote` produces for markdown — see `parseCanvas.ts` for how cards'
 * inline wikilinks and arrows become `note.links`. `content_hash` is over
 * the *whole* raw JSON (not just searchable text), so two canvases with
 * identical card prose but different arrows/positions never look identical
 * to `resolveNoteId`'s rename-matching. Can throw (invalid JSON, unknown
 * version) — callers must not let that escape into the sync loop, the same
 * "one malformed file can't break the whole vault" guarantee `parseNote`
 * gives markdown notes.
 */
function parseCanvasNote(raw: string, path: string): ParsedNote {
  const doc = parseCanvasDocument(raw);
  const now = new Date().toISOString();
  const searchableBody = canvasSearchableBody(doc);

  return {
    created: now,
    modified: now,
    body: searchableBody,
    title: titleFromPath(path),
    wordCount: countWords(searchableBody),
    contentHash: hashContent(raw),
    links: canvasLinks(doc),
    tags: parseInlineTags(searchableBody),
    isHub: false,
    hubFolder: null,
    hubRecursive: true,
    isCanvas: true,
  };
}

/**
 * Reads, parses, and indexes one absolute path inside the vault. Strips a
 * legacy frontmatter block if one is found (writing the file once), then
 * upserts notes/tags/note_tags/links/notes_fts. Never throws on a single
 * malformed file — a body is just a body now, so there's nothing left that
 * can fail to parse.
 */
export async function syncFile(vaultRoot: string, absolutePath: string): Promise<void> {
  const db = await getDb(vaultRoot);
  const raw = await readNoteOrNull(absolutePath);
  if (raw === null) return;
  await syncRawContent(db, vaultRoot, absolutePath, raw);
}

/**
 * Same as `syncFile`, but for an app-initiated rename (title field, folder-
 * tree drag): `renameEngine.ts` already knows the exact id of the note being
 * renamed, so this skips `resolveNoteId`'s hash-matching entirely — no need
 * to guess an answer that's already known.
 */
export async function syncFileAsRename(
  vaultRoot: string,
  absolutePath: string,
  knownId: string,
): Promise<void> {
  const db = await getDb(vaultRoot);
  const raw = await readNoteOrNull(absolutePath);
  if (raw === null) return;
  await syncRawContent(db, vaultRoot, absolutePath, raw, knownId);
}

async function readNoteOrNull(absolutePath: string): Promise<string | null> {
  try {
    return await invoke<string>('read_note', { path: absolutePath });
  } catch {
    // file vanished between the change event and this read; the remove path
    // (syncRemoved) or the next reconciliation pass handles it
    return null;
  }
}

async function syncRawContent(
  db: Database,
  vaultRoot: string,
  absolutePath: string,
  raw: string,
  knownId?: string,
): Promise<void> {
  if (absolutePath.endsWith(CANVAS_EXTENSION)) {
    let note: ParsedNote;
    try {
      note = parseCanvasNote(raw, absolutePath);
    } catch (error) {
      // A malformed canvas file must not abort the rest of the sync
      // batch/reconcile loop (reconcile.ts/rebuildIndex iterate every vault
      // file with no per-file try/catch of their own) — skip indexing this
      // one file and surface the failure for the user to notice/fix.
      console.error(`[vault] skipping malformed canvas file "${absolutePath}":`, error);
      return;
    }
    await upsertParsedNote(db, vaultRoot, absolutePath, note, knownId);
    return;
  }

  const { note, legacyId, strippedLegacyBlock } = parseNote(raw, absolutePath);

  if (strippedLegacyBlock) {
    await invoke('write_note', { path: absolutePath, content: note.body });
  }

  await upsertParsedNote(db, vaultRoot, absolutePath, note, knownId ?? legacyId);
}

export async function syncRemoved(vaultRoot: string, absolutePath: string): Promise<void> {
  const db = await getDb(vaultRoot);
  const relativePath = toRelativePath(vaultRoot, absolutePath);
  await db.execute('UPDATE notes SET is_deleted = 1 WHERE path = ?', [relativePath]);
}

/**
 * Figures out which note (if any) a freshly-synced file corresponds to, so a
 * rename doesn't look like "old note deleted, new note created" downstream.
 * Only called when the caller doesn't already know the id (see
 * `syncFileAsRename` and the legacy-id path in `syncRawContent`).
 *
 * 1. An `is_deleted = 0` row already at this exact path — an ordinary edit.
 * 2. Else, exactly one tombstoned row sharing this content hash — a rename
 *    (covers both a live external rename and one discovered at startup
 *    reconciliation; a same-batch external rename tombstones the old path
 *    before this runs — see vaultStore.ts's ordering).
 * 3. Multiple tombstoned matches (e.g. several empty notes) — ambiguous,
 *    don't guess.
 * 4. Otherwise — a genuinely new note; mint a fresh id.
 */
async function resolveNoteId(
  db: Database,
  relativePath: string,
  contentHash: string,
): Promise<string> {
  const atPath = await db.select<{ id: string }[]>(
    'SELECT id FROM notes WHERE path = ? AND is_deleted = 0',
    [relativePath],
  );
  if (atPath.length > 0) return atPath[0].id;

  const tombstoned = await db.select<{ id: string }[]>(
    'SELECT id FROM notes WHERE is_deleted = 1 AND content_hash = ?',
    [contentHash],
  );
  if (tombstoned.length === 1) return tombstoned[0].id;

  return ulid();
}

async function upsertParsedNote(
  db: Database,
  vaultRoot: string,
  absolutePath: string,
  note: ParsedNote,
  knownId: string | undefined,
): Promise<void> {
  const relativePath = toRelativePath(vaultRoot, absolutePath);
  const id = knownId ?? (await resolveNoteId(db, relativePath, note.contentHash));

  const existing = await db.select<{ id: string; path: string; title: string; created: string }[]>(
    'SELECT id, path, title, created FROM notes WHERE id = ?',
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

  // A row already found by id is authoritative for `created` — preserves
  // the real creation date across edits and renames. Only a row genuinely
  // new to the DB (first sync of a brand-new note, or the first
  // post-migration sync of a legacy note) falls back to `note.created`.
  const created = existing.length > 0 ? existing[0].created : note.created;

  // A stale row can already occupy this path under a *different* id — e.g.
  // two syncs raced on a brand-new file. This file's own resolved id is
  // authoritative; retire the stale row so this insert doesn't collide with
  // it on the `path` UNIQUE constraint.
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
    `INSERT INTO notes (id, path, title, created, modified, content_hash, synced_at_ms, word_count, is_deleted, needs_attention, is_hub, hub_folder, hub_recursive, is_canvas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       path = excluded.path,
       title = excluded.title,
       modified = excluded.modified,
       content_hash = excluded.content_hash,
       synced_at_ms = excluded.synced_at_ms,
       word_count = excluded.word_count,
       is_deleted = 0,
       needs_attention = 0,
       is_hub = excluded.is_hub,
       hub_folder = excluded.hub_folder,
       hub_recursive = excluded.hub_recursive,
       is_canvas = excluded.is_canvas`,
    [
      id,
      relativePath,
      note.title,
      created,
      note.modified,
      note.contentHash,
      Date.now(),
      note.wordCount,
      note.isHub ? 1 : 0,
      note.hubFolder,
      note.hubRecursive ? 1 : 0,
      note.isCanvas ? 1 : 0,
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
