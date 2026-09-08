import { invoke } from '@tauri-apps/api/core';
import type Database from '@tauri-apps/plugin-sql';
import { getDb } from '../db/client';
import { syncFile, toRelativePath } from './syncEngine';
import type { VaultFile } from './types';

interface IndexedNoteRow {
  path: string;
  synced_at_ms: number;
  is_deleted: number;
}

const FRONTMATTER_MIGRATED_KEY = 'frontmatter_migrated';

/**
 * A note already indexed before legacy frontmatter stripping shipped has an
 * unchanged on-disk mtime — the ordinary "disk newer than last sync" check
 * below has no way to know it still needs stripping, since nothing about
 * the file changed under the *old* code. This one-time flag (in the
 * existing `meta` table) forces exactly one full resync of every file so
 * `syncFile`'s strip runs for each; every reconcile after that reverts to
 * the cheap mtime-only check, since `syncFile` always leaves a
 * frontmatter-free file behind.
 */
async function isFrontmatterMigrated(db: Database): Promise<boolean> {
  const rows = await db.select<{ value: string }[]>('SELECT value FROM meta WHERE key = ?', [
    FRONTMATTER_MIGRATED_KEY,
  ]);
  return rows.length > 0 && rows[0].value === '1';
}

async function markFrontmatterMigrated(db: Database): Promise<void> {
  await db.execute(
    `INSERT INTO meta (key, value) VALUES (?, '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [FRONTMATTER_MIGRATED_KEY],
  );
}

/**
 * Cheap startup pass: stat every file on disk (no reads) and compare against
 * what the index already knows. Only new, previously-tombstoned, or
 * disk-newer-than-last-sync files get actually read and reparsed (unless
 * this is the one-time forced pass — see isFrontmatterMigrated). Anything
 * indexed but no longer present on disk is tombstoned.
 */
export async function reconcileVault(vaultRoot: string): Promise<void> {
  const db = await getDb(vaultRoot);
  const diskFiles = await invoke<VaultFile[]>('list_vault_files', { root: vaultRoot });
  const indexed = await db.select<IndexedNoteRow[]>(
    'SELECT path, synced_at_ms, is_deleted FROM notes',
  );
  const indexedByPath = new Map(indexed.map((row) => [row.path, row]));
  const migrated = await isFrontmatterMigrated(db);

  const diskPaths = new Set<string>();
  for (const file of diskFiles) {
    diskPaths.add(toRelativePath(vaultRoot, file.path));
  }

  // Tombstone every vanished path *before* syncing new/changed files —
  // resolveNoteId's rename detection (syncEngine.ts) matches a new file
  // against tombstoned rows by content hash, so the old row needs to already
  // be marked gone by the time a same-reconcile rename target is synced.
  for (const row of indexed) {
    if (!diskPaths.has(row.path) && row.is_deleted === 0) {
      await db.execute('UPDATE notes SET is_deleted = 1 WHERE path = ?', [row.path]);
    }
  }

  for (const file of diskFiles) {
    const relativePath = toRelativePath(vaultRoot, file.path);
    const existing = indexedByPath.get(relativePath);
    const needsResync =
      !migrated || !existing || existing.is_deleted === 1 || file.modifiedMs > existing.synced_at_ms;

    if (needsResync) {
      await syncFile(vaultRoot, file.path);
    }
  }

  if (!migrated) {
    await markFrontmatterMigrated(db);
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

  // Every file was just synced unconditionally — no need for reconcileVault
  // to force another full pass on the next launch.
  await markFrontmatterMigrated(db);
}
