import { invoke } from '@tauri-apps/api/core';
import type { NoteSummary } from '../db/queries/notes';
import { getDb } from '../db/client';
import { getEditorView } from '../editor/editorRegistry';
import { reconcileVault } from './reconcile';
import { syncFile } from './syncEngine';

/**
 * Moves a note into `targetFolderPath` (vault-relative, `''` for the vault
 * root), keeping its filename — and therefore its title — unchanged.
 * Wikilinks resolve by title, not path (see `aliasResolution.ts`), so
 * unlike `renameEngine.ts`'s title rename, a plain folder move never needs
 * to rewrite any referencing file. Returns the note's new relative path,
 * or its unchanged path if it was already there.
 */
export async function moveNoteToFolder(
  vaultRoot: string,
  note: Pick<NoteSummary, 'path'>,
  targetFolderPath: string,
): Promise<string> {
  const fileName = note.path.split('/').pop() ?? note.path;
  const newRelativePath = targetFolderPath ? `${targetFolderPath}/${fileName}` : fileName;
  if (newRelativePath === note.path) return note.path;

  const db = await getDb(vaultRoot);
  const collision = await db.select<{ id: string }[]>('SELECT id FROM notes WHERE path = ? AND is_deleted = 0', [
    newRelativePath,
  ]);
  if (collision.length > 0) throw new Error(`A note already exists at "${newRelativePath}"`);

  const oldAbsolutePath = `${vaultRoot}/${note.path}`;
  const newAbsolutePath = `${vaultRoot}/${newRelativePath}`;

  // Mirrors renameEngine.ts's flush: an open buffer can be ahead of disk
  // (autosave is debounced), so the moved file must carry the latest text.
  const openView = getEditorView(oldAbsolutePath);
  if (openView) {
    await invoke('write_note', { path: oldAbsolutePath, content: openView.state.doc.toString() });
  }

  await invoke('rename_note', { oldPath: oldAbsolutePath, newPath: newAbsolutePath });
  await syncFile(vaultRoot, newAbsolutePath);
  return newRelativePath;
}

/**
 * Shared by `moveFolder` and `renameFolder` below — both are ultimately the
 * same disk operation (one directory rename), just computing the new full
 * path differently. Since it's a single `fs::rename` of the directory
 * itself, every note inside it changes path in one shot with no per-file
 * work; `reconcileVault` afterward picks up all of those changed paths the
 * same cheap, stat-based way it does on every launch.
 */
async function renameOrMoveFolder(vaultRoot: string, oldRelativePath: string, newRelativePath: string): Promise<string> {
  if (oldRelativePath === newRelativePath) return oldRelativePath;
  if (newRelativePath.startsWith(`${oldRelativePath}/`)) {
    throw new Error('Cannot move a folder into itself or one of its own subfolders');
  }

  await invoke('move_folder', {
    oldPath: `${vaultRoot}/${oldRelativePath}`,
    newPath: `${vaultRoot}/${newRelativePath}`,
  });
  await reconcileVault(vaultRoot);
  return newRelativePath;
}

/**
 * Drag-move: moves `folderPath` to become a child of `targetParentPath`
 * (vault-relative, `''` for the vault root), keeping its own leaf name —
 * the folder-tree counterpart to `moveNoteToFolder` above, same target
 * convention (a destination *parent*, not a full new path). Returns the
 * folder's new relative path (unchanged if it was already there), same
 * convention as `moveNoteToFolder` — the caller needs it to remap any open
 * tabs for notes that lived inside the moved folder.
 */
export async function moveFolder(vaultRoot: string, folderPath: string, targetParentPath: string): Promise<string> {
  const leafName = folderPath.split('/').pop() ?? folderPath;
  const newRelativePath = targetParentPath ? `${targetParentPath}/${leafName}` : leafName;
  return renameOrMoveFolder(vaultRoot, folderPath, newRelativePath);
}

/** Renames `folderPath` in place — same parent, new leaf name. Returns the
 *  folder's new relative path, same convention as `moveFolder`. */
export async function renameFolder(vaultRoot: string, folderPath: string, newName: string): Promise<string> {
  const slashIndex = folderPath.lastIndexOf('/');
  const parentPath = slashIndex >= 0 ? folderPath.slice(0, slashIndex) : '';
  const newRelativePath = parentPath ? `${parentPath}/${newName}` : newName;
  return renameOrMoveFolder(vaultRoot, folderPath, newRelativePath);
}

/** Creates an empty folder at `relativePath` (parents included). */
export async function createFolder(vaultRoot: string, relativePath: string): Promise<void> {
  await invoke('ensure_dir', { path: `${vaultRoot}/${relativePath}` });
}

/**
 * Permanently deletes `folderPath` and everything inside it. Irreversible —
 * callers confirm with the user first. Like `renameOrMoveFolder`, this is a
 * single filesystem op (a recursive directory remove) with no per-file
 * bookkeeping; `reconcileVault` afterward notices every note that used to
 * live under it is now missing from disk and tombstones each one the same
 * way it would for any other externally-deleted file.
 */
export async function deleteFolder(vaultRoot: string, folderPath: string): Promise<void> {
  await invoke('delete_folder', { path: `${vaultRoot}/${folderPath}` });
  await reconcileVault(vaultRoot);
}
