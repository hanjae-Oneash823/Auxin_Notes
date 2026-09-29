import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import usageInitSql from './migrations/usage/0001_init.sql?raw';

let dbInstance: Database | null = null;
let dbVaultRoot: string | null = null;

/**
 * Opens (or reuses) the connection to `<vaultRoot>/.auxin/usage.sqlite` — a
 * separate file from index.sqlite (client.ts's getDb) by design: this one
 * logs app-usage history, which must survive an index rebuild, while
 * index.sqlite is a pure derived cache that gets dropped and re-walked
 * freely. Same load/migrate shape as client.ts's getDb otherwise.
 */
export async function getUsageDb(vaultRoot: string): Promise<Database> {
  if (dbInstance && dbVaultRoot === vaultRoot) {
    return dbInstance;
  }
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }

  await invoke('ensure_dir', { path: `${vaultRoot}/.auxin` });

  const db = await Database.load(`sqlite:${vaultRoot}/.auxin/usage.sqlite`);
  await db.execute('PRAGMA journal_mode=WAL;');
  await runMigrations(db);

  dbInstance = db;
  dbVaultRoot = vaultRoot;
  return db;
}

/** Same naive-but-sufficient comment stripping as client.ts's
 *  stripSqlLineComments — this schema file has no string literals
 *  containing `--` either. */
function stripSqlLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const commentIndex = line.indexOf('--');
      return commentIndex === -1 ? line : line.slice(0, commentIndex);
    })
    .join('\n');
}

async function runMigrations(db: Database): Promise<void> {
  for (const migrationSql of [usageInitSql]) {
    const statements = stripSqlLineComments(migrationSql)
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await db.execute(statement);
    }
  }
}
