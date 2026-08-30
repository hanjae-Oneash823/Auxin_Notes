import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../db/client';
import { syncFile, toRelativePath } from './syncEngine';
import type { VaultFile } from './types';

interface IndexedNoteRow {
  path: string;
  synced_at_ms: number;
  is_deleted: number;
}

/**
 * Cheap startup pass: stat every file on disk (no reads) and compare against
 * what the index already knows. Only new, previously-tombstoned, or
 * disk-newer-than-last-sync files get actually read and reparsed. Anything
 * indexed but no longer present on disk is tombstoned.
 */
export async function reconcileVault(vaultRoot: string): Promise<void> {
  const db = await getDb(vaultRoot);
  const diskFiles = await invoke<VaultFile[]>('list_vault_files', { root: vaultRoot });
  const indexed = await db.select<IndexedNoteRow[]>(
    'SELECT path, synced_at_ms, is_deleted FROM notes',
  );
  const indexedByPath = new Map(indexed.map((row) => [row.path, row]));

  const diskPaths = new Set<string>();
  for (const file of diskFiles) {
    const relativePath = toRelativePath(vaultRoot, file.path);
    diskPaths.add(relativePath);

    const existing = indexedByPath.get(relativePath);
    const needsResync =
      !existing || existing.is_deleted === 1 || file.modifiedMs > existing.synced_at_ms;

    if (needsResync) {
      await syncFile(vaultRoot, file.path);
    }
  }

  for (const row of indexed) {
    if (!diskPaths.has(row.path) && row.is_deleted === 0) {
      await db.execute('UPDATE notes SET is_deleted = 1 WHERE path = ?', [row.path]);
    }
  }
}

/**
 * Full rebuild: drop everything and re-derive from the vault. Always safe —
 * the index is a pure function of on-disk content, so this can never lose
 * data or diverge from the truth. Used as the manual "Rebuild Index" action
 * and as the automatic fallback when the index is missing/corrupt.
 */
export async function rebuildIndex(vaultRoot: string): Promise<void> {
  const db = await getDb(vaultRoot);
  await db.execute('DELETE FROM notes');
  await db.execute('DELETE FROM tags');
  await db.execute('DELETE FROM note_tags');
  await db.execute('DELETE FROM links');
  await db.execute('DELETE FROM notes_fts');
  await db.execute('DELETE FROM note_aliases');
  await db.execute('DELETE FROM properties');

  const diskFiles = await invoke<VaultFile[]>('list_vault_files', { root: vaultRoot });
  for (const file of diskFiles) {
    await syncFile(vaultRoot, file.path);
  }
}
