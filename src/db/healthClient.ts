import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import healthInitSql from './migrations/health/0001_init.sql?raw';
import { stripSqlLineComments } from './client';

let dbInstance: Database | null = null;
let dbVaultRoot: string | null = null;

/**
 * Opens (or reuses) the connection to `<vaultRoot>/.auxin/health.sqlite` — habits
 * and sleep, source of truth like planner.sqlite (see plannerClient.ts) and
 * likewise separate from the derived index.sqlite.
 */
export async function getHealthDb(vaultRoot: string): Promise<Database> {
  if (dbInstance && dbVaultRoot === vaultRoot) {
    return dbInstance;
  }
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }

  await invoke('ensure_dir', { path: `${vaultRoot}/.auxin` });

  const db = await Database.load(`sqlite:${vaultRoot}/.auxin/health.sqlite`);
  await db.execute('PRAGMA journal_mode=WAL;');
  await db.execute('PRAGMA foreign_keys=ON;');
  await runMigrations(db);

  dbInstance = db;
  dbVaultRoot = vaultRoot;
  return db;
}

async function runMigrations(db: Database): Promise<void> {
  for (const migrationSql of [healthInitSql]) {
    const statements = stripSqlLineComments(migrationSql)
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await db.execute(statement);
    }
  }
}
