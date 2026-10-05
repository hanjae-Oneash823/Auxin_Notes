import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import plannerInitSql from './migrations/planner/0001_init.sql?raw';
import plannerPoolsSql from './migrations/planner/0002_pools.sql?raw';
import plannerFreezerSql from './migrations/planner/0003_freezer.sql?raw';
import plannerGrillSql from './migrations/planner/0004_grill.sql?raw';
import { stripSqlLineComments } from './client';

let dbInstance: Database | null = null;
let dbVaultRoot: string | null = null;

/**
 * Opens (or reuses) the connection to `<vaultRoot>/.auxin/planner.sqlite` — a
 * separate file from index.sqlite (client.ts's getDb) by design: planner rows
 * are source of truth, while index.sqlite is a derived cache that gets dropped
 * and re-walked freely. Same shape as usageClient.ts's getUsageDb, plus
 * `foreign_keys=ON` because this schema relies on its cascades.
 */
export async function getPlannerDb(vaultRoot: string): Promise<Database> {
  if (dbInstance && dbVaultRoot === vaultRoot) {
    return dbInstance;
  }
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }

  await invoke('ensure_dir', { path: `${vaultRoot}/.auxin` });

  const db = await Database.load(`sqlite:${vaultRoot}/.auxin/planner.sqlite`);
  await db.execute('PRAGMA journal_mode=WAL;');
  await db.execute('PRAGMA foreign_keys=ON;');
  await runMigrations(db);

  dbInstance = db;
  dbVaultRoot = vaultRoot;
  return db;
}

/** Migrations run once each, in order; PRAGMA user_version records how many have been applied (0001 is idempotent, so existing databases at 0 re-run it safely). */
async function runMigrations(db: Database): Promise<void> {
  const [{ user_version: applied }] = await db.select<{ user_version: number }[]>('PRAGMA user_version');
  for (const [index, migrationSql] of [plannerInitSql, plannerPoolsSql, plannerFreezerSql, plannerGrillSql].entries()) {
    if (index < applied) continue;
    const statements = stripSqlLineComments(migrationSql)
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await db.execute(statement);
    }
    await db.execute(`PRAGMA user_version = ${index + 1}`);
  }
}
