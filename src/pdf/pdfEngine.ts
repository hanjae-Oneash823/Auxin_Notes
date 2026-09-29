import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../db/client';
import type { NoteSummary } from '../db/queries/notes';
import { moveNoteToFolder } from '../vault/folderEngine';
import { dirname, titleFromPath } from '../vault/noteTitle';
import { renameNote } from '../vault/renameEngine';
import { syncFile, syncRemoved, toRelativePath } from '../vault/syncEngine';
import { isPdfPath, notePathForPdf } from './pdfFiles';

/** Raw shape of `list_vault_files` — serde leaves the keys snake_case. */
interface DiskFile {
  path: string;
  modified_ms: number;
}

/** PDFs aren't indexed (they have no text to parse) — they come straight
 *  from the same disk walk reconciliation uses, shaped as NoteSummary so the
 *  folder tree and tab bar treat them like any other row. `id` is the path. */
export async function listPdfSummaries(vaultRoot: string): Promise<NoteSummary[]> {
  const files = await invoke<DiskFile[]>('list_vault_files', { root: vaultRoot });
  return files
    .filter((file) => isPdfPath(file.path))
    .map((file) => {
      const path = toRelativePath(vaultRoot, file.path);
      return {
        id: path,
        path,
        title: titleFromPath(path),
        modified: new Date(file.modified_ms).toISOString(),
        needsAttention: false,
        isHub: false,
        isCanvas: false,
        isPdf: true,
      };
    });
}

/** The fused note's index row, or null when the PDF has no note (yet). */
async function findFusedNote(vaultRoot: string, pdfPath: string): Promise<{ id: string; path: string } | null> {
  const db = await getDb(vaultRoot);
  const rows = await db.select<{ id: string; path: string }[]>(
    'SELECT id, path FROM notes WHERE path = ? AND is_deleted = 0',
    [notePathForPdf(pdfPath)],
  );
  return rows[0] ?? null;
}

/** Throws if either half of the destination pair is already on disk — checked
 *  for the note half even when this PDF has no note, so a rename/move can't
 *  silently fuse it to an unrelated `.md` that happens to share the name. */
async function assertPairFree(vaultRoot: string, newPdfPath: string): Promise<void> {
  const candidates = [newPdfPath, notePathForPdf(newPdfPath)];
  const taken = await invoke<string[]>('existing_paths', { paths: candidates.map((p) => `${vaultRoot}/${p}`) });
  if (taken.length > 0) throw new Error(`"${taken[0].slice(vaultRoot.length + 1)}" already exists`);
}

/** Renames the PDF and its note together; returns the PDF's new relative path. */
export async function renamePdfPair(vaultRoot: string, pdf: NoteSummary, newTitle: string): Promise<string> {
  const title = newTitle.trim();
  if (!title) throw new Error('Title cannot be empty');
  if (title.includes('/')) throw new Error('Title cannot contain "/"');

  const dir = dirname(pdf.path);
  const newPdfPath = `${dir ? `${dir}/` : ''}${title}.pdf`;
  if (newPdfPath === pdf.path) return pdf.path;

  await assertPairFree(vaultRoot, newPdfPath);
  const note = await findFusedNote(vaultRoot, pdf.path);
  await invoke('rename_note', { oldPath: `${vaultRoot}/${pdf.path}`, newPath: `${vaultRoot}/${newPdfPath}` });
  // renameNote also rewrites [[wikilinks]] pointing at the note's old title.
  if (note) await renameNote(vaultRoot, note.id, title);
  return newPdfPath;
}

/** Moves the PDF and its note into `targetFolderPath` together; returns the
 *  PDF's new relative path. */
export async function movePdfPair(vaultRoot: string, pdf: NoteSummary, targetFolderPath: string): Promise<string> {
  const fileName = pdf.path.split('/').pop() ?? pdf.path;
  const newPdfPath = targetFolderPath ? `${targetFolderPath}/${fileName}` : fileName;
  if (newPdfPath === pdf.path) return pdf.path;

  await assertPairFree(vaultRoot, newPdfPath);
  const note = await findFusedNote(vaultRoot, pdf.path);
  await invoke('rename_note', { oldPath: `${vaultRoot}/${pdf.path}`, newPath: `${vaultRoot}/${newPdfPath}` });
  if (note) await moveNoteToFolder(vaultRoot, note, targetFolderPath);
  return newPdfPath;
}

/** Deletes the PDF. `keepNote` leaves the `.md` behind — with its PDF gone
 *  it simply stops being fused and shows up as an ordinary note. */
export async function deletePdf(vaultRoot: string, pdf: NoteSummary, keepNote: boolean): Promise<void> {
  const note = await findFusedNote(vaultRoot, pdf.path);
  await invoke('delete_note', { path: `${vaultRoot}/${pdf.path}` });
  if (!note || keepNote) return;
  const notePath = `${vaultRoot}/${note.path}`;
  await invoke('delete_note', { path: notePath });
  await syncRemoved(vaultRoot, notePath);
}

/** Gives a note-less PDF its note (empty unless `content` is given); returns the note's absolute path. */
export async function createPdfNote(vaultRoot: string, pdfPath: string, content = ''): Promise<string> {
  const absolutePath = `${vaultRoot}/${notePathForPdf(pdfPath)}`;
  await invoke('write_note', { path: absolutePath, content });
  await syncFile(vaultRoot, absolutePath);
  return absolutePath;
}
