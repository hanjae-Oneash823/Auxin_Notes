import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../db/client';
import { getEditorView } from '../editor/editorRegistry';
import { CANVAS_EXTENSION } from './canvasTypes';
import { parseCanvasDocument } from './parseCanvas';
import { syncFile, syncFileAsRename } from './syncEngine';
import type { CanvasCard, CanvasDocument } from './canvasTypes';

export interface RenameFailure {
  path: string;
  error: string;
}

export interface RenameResult {
  success: boolean;
  newPath: string;
  /** Referencing files whose `[[Old Title]]` links were rewritten. */
  updatedCount: number;
  totalImpacted: number;
  failures: RenameFailure[];
}

interface WikilinkEdit {
  from: number;
  to: number;
  insert: string;
}

// Matches [[Target]] or [[Target|alias]] — same shape as parseLinksAndTags's
// WIKILINK_PATTERN, kept local so this module has no runtime dependency on
// the parser beyond the target/alias split it also relies on.
const WIKILINK_PATTERN = /\[\[([^\]|]+?)(\|[^\]]+?)?\]\]/g;

/**
 * Renames a note and propagates the change to every file that links to it.
 *
 * Order matters: the impact set (who links to this note) is resolved from
 * the index *before* the file is renamed on disk, per the plan's rename
 * design — renaming first would make `links.target_id` for the old path
 * meaningless before we've had a chance to read it.
 *
 * A failure on any one referencing file (e.g. read-only, disk full) does not
 * abort the rename or the rest of the propagation — it's collected and
 * reported as a partial result ("N of M files updated"), never silently
 * dropped and never left half-done without telling the caller.
 */
export async function renameNote(
  vaultRoot: string,
  noteId: string,
  newTitle: string,
): Promise<RenameResult> {
  const title = newTitle.trim();
  if (!title) throw new Error('Title cannot be empty');
  if (title.includes('/')) throw new Error('Title cannot contain "/"');

  const db = await getDb(vaultRoot);
  const rows = await db.select<{ path: string; title: string }[]>(
    'SELECT path, title FROM notes WHERE id = ? AND is_deleted = 0',
    [noteId],
  );
  if (rows.length === 0) throw new Error('Note not found');
  const { path: oldRelativePath, title: oldTitle } = rows[0];
  const newRelativePath = replaceFileNameInPath(oldRelativePath, title);

  if (oldTitle === title) {
    return { success: true, newPath: oldRelativePath, updatedCount: 0, totalImpacted: 0, failures: [] };
  }

  const collision = await db.select<{ id: string }[]>(
    'SELECT id FROM notes WHERE path = ? AND is_deleted = 0',
    [newRelativePath],
  );
  if (collision.length > 0) {
    throw new Error(`A note already exists at "${newRelativePath}"`);
  }

  const impacted = await db.select<{ path: string }[]>(
    `SELECT DISTINCT n.path FROM links l
     JOIN notes n ON n.id = l.source_id
     WHERE l.target_id = ? AND n.is_deleted = 0 AND n.id != ?`,
    [noteId, noteId],
  );

  const oldAbsolutePath = `${vaultRoot}/${oldRelativePath}`;
  const newAbsolutePath = `${vaultRoot}/${newRelativePath}`;

  // If this note is open, its live buffer can be ahead of what's on disk —
  // Editor.tsx's autosave is debounced, so a rename triggered right after
  // typing could otherwise carry stale content. Flush first so the file
  // being renamed always has the actual latest text.
  const openView = getEditorView(oldAbsolutePath);
  if (openView) {
    await invoke('write_note', { path: oldAbsolutePath, content: openView.state.doc.toString() });
  }

  await invoke('rename_note', { oldPath: oldAbsolutePath, newPath: newAbsolutePath });
  // The id is already known — no need for resolveNoteId's hash-matching.
  // syncFileAsRename records the old title into note_aliases and updates
  // notes.path/title (see upsertParsedNote in syncEngine.ts).
  await syncFileAsRename(vaultRoot, newAbsolutePath, noteId);

  const { updatedCount, failures } = await relinkAcrossFiles(
    vaultRoot,
    impacted.map((row) => row.path),
    oldTitle,
    title,
    oldRelativePath,
    newRelativePath,
  );

  return {
    success: failures.length === 0,
    newPath: newRelativePath,
    updatedCount,
    totalImpacted: impacted.length,
    failures,
  };
}

/**
 * Retargets every `[[oldTarget]]`/`[[oldTarget|alias]]` occurrence across a
 * given set of vault-relative file paths to `newTarget`, collecting
 * per-file failures instead of aborting. Shared by `renameNote` (impact set
 * = notes linking to the renamed note, by id) and `relinkRawTarget` (impact
 * set = notes linking to a specific unresolved raw target string) — the
 * underlying "rewrite this literal bracket text everywhere it appears in
 * these files" mechanics are identical either way.
 */
export async function relinkAcrossFiles(
  vaultRoot: string,
  relativePaths: string[],
  oldTarget: string,
  newTarget: string,
  /** Only known by `renameNote` (renaming an existing note) — `relinkRawTarget`
   *  has no path to give, since it's retargeting a raw string that need not
   *  correspond to any real note yet. Without these, a canvas's promoted-card
   *  `content.path` fields are left untouched (nothing to safely match). */
  oldPath?: string,
  newPath?: string,
): Promise<{ updatedCount: number; failures: RenameFailure[] }> {
  const failures: RenameFailure[] = [];
  let updatedCount = 0;

  for (const relativePath of relativePaths) {
    try {
      const absolutePath = `${vaultRoot}/${relativePath}`;
      const rewrote = relativePath.endsWith(CANVAS_EXTENSION)
        ? await rewriteCanvasFile(vaultRoot, absolutePath, oldTarget, newTarget, oldPath ?? null, newPath ?? null)
        : await rewriteLinksInFile(vaultRoot, absolutePath, oldTarget, newTarget);
      if (rewrote) updatedCount++;
    } catch (error: unknown) {
      failures.push({ path: relativePath, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { updatedCount, failures };
}

/**
 * Manual counterpart to `renameNote`'s propagation, for the "Unresolved
 * Links" view: retargets every reference to a specific raw `[[text]]` (not
 * necessarily an existing note's title — could be a typo or an ambiguous
 * target the user is pinning to one candidate) across the whole vault.
 */
export async function relinkRawTarget(
  vaultRoot: string,
  oldTarget: string,
  newTarget: string,
): Promise<RenameResult> {
  const db = await getDb(vaultRoot);
  const impacted = await db.select<{ path: string }[]>(
    `SELECT DISTINCT n.path FROM links l
     JOIN notes n ON n.id = l.source_id
     WHERE l.target_raw = ? AND n.is_deleted = 0`,
    [oldTarget],
  );

  const { updatedCount, failures } = await relinkAcrossFiles(
    vaultRoot,
    impacted.map((row) => row.path),
    oldTarget,
    newTarget,
  );

  return {
    success: failures.length === 0,
    newPath: '',
    updatedCount,
    totalImpacted: impacted.length,
    failures,
  };
}

/**
 * Updates any canvas card whose `content.path` points at `noteId`, after its
 * path changes without its title changing — a folder move/drag
 * (`folderEngine.ts`'s `moveNoteToFolder`), which `renameNote`'s own
 * propagation never runs for (title-based wikilinks don't need it — see
 * `moveNoteToFolder`'s doc comment — but a canvas card's `content.path` is a
 * literal path, not a title, so it goes stale on a path-only move too).
 *
 * Reuses `renameNote`'s own impact-set query: a canvas arrow pointing at a
 * promoted note resolves via that note's *title* (`parseCanvas.ts`), so its
 * `links.target_id` is unaffected by a path-only move — the canvases that
 * reference this note are exactly the same set either way. Best-effort: the
 * folder move itself has already succeeded on disk by the time this runs,
 * so a failure here is swallowed rather than surfaced as a failed move — a
 * stale reference shows up as a broken "open" affordance on that one card,
 * not a mysterious move failure.
 */
export async function relinkCanvasNotePath(
  vaultRoot: string,
  noteId: string,
  oldRelativePath: string,
  newRelativePath: string,
): Promise<void> {
  if (oldRelativePath === newRelativePath) return;

  const db = await getDb(vaultRoot);
  const noteRows = await db.select<{ title: string }[]>('SELECT title FROM notes WHERE id = ?', [noteId]);
  const title = noteRows[0]?.title ?? '';

  const impacted = await db.select<{ path: string }[]>(
    `SELECT DISTINCT n.path FROM links l
     JOIN notes n ON n.id = l.source_id
     WHERE l.target_id = ? AND n.is_deleted = 0 AND n.is_canvas = 1`,
    [noteId],
  );

  for (const { path: canvasRelativePath } of impacted) {
    try {
      await rewriteCanvasFile(vaultRoot, `${vaultRoot}/${canvasRelativePath}`, title, title, oldRelativePath, newRelativePath);
    } catch {
      // See doc comment above — deliberately not collected/reported.
    }
  }
}

/**
 * Rewrites every `[[Old Title]]` / `[[Old Title|alias]]` occurrence in one
 * file to the new title, preserving any `|alias` text. If the file is
 * currently open in the editor, the live buffer is patched via a targeted
 * CM6 transaction (keeps cursor position and undo history) rather than
 * silently overwritten on disk under the editor's feet; the on-disk write
 * still happens immediately either way, so propagation doesn't wait on the
 * editor's own autosave debounce.
 */
async function rewriteLinksInFile(
  vaultRoot: string,
  absolutePath: string,
  oldTitle: string,
  newTitle: string,
): Promise<boolean> {
  const openView = getEditorView(absolutePath);
  const currentText = openView
    ? openView.state.doc.toString()
    : await invoke<string>('read_note', { path: absolutePath });

  const edits = buildRenameEdits(currentText, oldTitle, newTitle);
  if (edits.length === 0) return false;

  if (openView) {
    openView.dispatch({ changes: edits });
  }

  const newText = applyEditsToText(currentText, edits);
  await invoke('write_note', { path: absolutePath, content: newText });
  await syncFile(vaultRoot, absolutePath);
  return true;
}

/**
 * Canvas counterpart to `rewriteLinksInFile` — JSON-structure-aware instead
 * of a plain-text regex, since a canvas's arrows and promoted-card
 * references aren't literal `[[bracket]]` text the way a note body's links
 * are (see `parseCanvas.ts`'s `canvasLinks`). Rewrites three things in one
 * pass over the parsed document: an inline card's own `[[oldTitle]]` body
 * text (the same substitution `rewriteLinksInFile` does for a note body —
 * safe here too, since it's still just a string field), a promoted card's
 * `content.path` when it matches `oldPath` (only when the caller knows one
 * — `relinkRawTarget` doesn't), and a ghost card's `title` when it matches
 * `oldTitle`. A malformed canvas file is skipped (nothing safe to rewrite),
 * same "don't break the batch over one bad file" stance as the rest of the
 * vault-sync/rename pipeline.
 *
 * Always reads/writes the file on disk directly — unlike `rewriteLinksInFile`,
 * there's no open-CanvasView-buffer equivalent of `editorRegistry` to patch
 * in place, so a rename landing mid-edit of an already-open canvas is a
 * known, accepted gap (rare: the canvas's own 500ms autosave usually beats
 * a separate rename action to disk).
 */
async function rewriteCanvasFile(
  vaultRoot: string,
  absolutePath: string,
  oldTitle: string,
  newTitle: string,
  oldPath: string | null,
  newPath: string | null,
): Promise<boolean> {
  const raw = await invoke<string>('read_note', { path: absolutePath });
  let doc: CanvasDocument;
  try {
    doc = parseCanvasDocument(raw);
  } catch {
    return false;
  }

  let changed = false;
  const cards: CanvasCard[] = doc.cards.map((card) => {
    if (card.content.type === 'inline') {
      const edits = buildRenameEdits(card.content.body, oldTitle, newTitle);
      if (edits.length === 0) return card;
      changed = true;
      return { ...card, content: { ...card.content, body: applyEditsToText(card.content.body, edits) } };
    }
    if (card.content.type === 'note' && oldPath && newPath && card.content.path === oldPath) {
      changed = true;
      return { ...card, content: { ...card.content, path: newPath } };
    }
    if (card.content.type === 'ghost' && card.content.title === oldTitle) {
      changed = true;
      return { ...card, content: { ...card.content, title: newTitle } };
    }
    return card;
  });

  if (!changed) return false;

  await invoke('write_note', { path: absolutePath, content: JSON.stringify({ ...doc, cards }) });
  await syncFile(vaultRoot, absolutePath);
  return true;
}

/** Pure and independently testable: given a document's text, produces the
 *  set of edits that retarget every `[[oldTitle]]`/`[[oldTitle|alias]]` to
 *  `newTitle`, leaving unrelated links untouched. */
export function buildRenameEdits(docText: string, oldTitle: string, newTitle: string): WikilinkEdit[] {
  const edits: WikilinkEdit[] = [];
  for (const match of docText.matchAll(WIKILINK_PATTERN)) {
    if (match[1].trim() !== oldTitle) continue;
    const aliasPart = match[2] ?? '';
    const from = match.index ?? 0;
    edits.push({ from, to: from + match[0].length, insert: `[[${newTitle}${aliasPart}]]` });
  }
  return edits;
}

function applyEditsToText(text: string, edits: WikilinkEdit[]): string {
  let result = text;
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
  }
  return result;
}

/** Preserves the original file's own extension (`.md` or `.axcanvas`) rather
 *  than assuming `.md` — renaming a canvas note must not silently turn it
 *  into a markdown file. */
function replaceFileNameInPath(relativePath: string, newTitle: string): string {
  const slashIndex = relativePath.lastIndexOf('/');
  const dir = slashIndex >= 0 ? relativePath.slice(0, slashIndex + 1) : '';
  const extension = relativePath.endsWith(CANVAS_EXTENSION) ? CANVAS_EXTENSION : '.md';
  return `${dir}${newTitle}${extension}`;
}
