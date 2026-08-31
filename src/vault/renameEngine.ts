import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../db/client';
import { getEditorView } from '../editor/editorRegistry';
import { syncFile } from './syncEngine';

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
  // Same id at a new path: syncFile records the old title into note_aliases
  // and updates notes.path/title (see upsertParsedNote in syncEngine.ts).
  await syncFile(vaultRoot, newAbsolutePath);

  const { updatedCount, failures } = await relinkAcrossFiles(
    vaultRoot,
    impacted.map((row) => row.path),
    oldTitle,
    title,
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
): Promise<{ updatedCount: number; failures: RenameFailure[] }> {
  const failures: RenameFailure[] = [];
  let updatedCount = 0;

  for (const relativePath of relativePaths) {
    try {
      const rewrote = await rewriteLinksInFile(vaultRoot, `${vaultRoot}/${relativePath}`, oldTarget, newTarget);
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

function replaceFileNameInPath(relativePath: string, newTitle: string): string {
  const slashIndex = relativePath.lastIndexOf('/');
  const dir = slashIndex >= 0 ? relativePath.slice(0, slashIndex + 1) : '';
  return `${dir}${newTitle}.md`;
}
