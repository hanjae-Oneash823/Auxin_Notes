import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import initSql from './migrations/0001_init.sql?raw';

let dbInstance: Database | null = null;
let dbVaultRoot: string | null = null;

/**
 * Opens (or reuses) the connection to `<vaultRoot>/.auxin/index.sqlite` and
 * applies the schema. Safe to call repeatedly for the same vault — migrations
 * are idempotent (`CREATE ... IF NOT EXISTS`).
 */
export async function getDb(vaultRoot: string): Promise<Database> {
  if (dbInstance && dbVaultRoot === vaultRoot) {
    return dbInstance;
  }
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }

  await invoke('ensure_dir', { path: `${vaultRoot}/.auxin` });

  const db = await Database.load(`sqlite:${vaultRoot}/.auxin/index.sqlite`);
  await db.execute('PRAGMA journal_mode=WAL;');
  // SQLite ignores the schema's declared ON DELETE CASCADE/SET NULL unless
  // FK enforcement is turned on per-connection — it defaults off.
  await db.execute('PRAGMA foreign_keys=ON;');
  await runMigrations(db);

  dbInstance = db;
  dbVaultRoot = vaultRoot;
  return db;
}

/** Strips `-- line comments` before splitting on `;` — a comment containing
 *  its own semicolon (e.g. "tombstone; file missing") would otherwise split
 *  a statement in half, producing "incomplete input" from SQLite. Naive but
 *  sufficient: this schema file has no string literals containing `--`. */
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
  const statements = stripSqlLineComments(initSql)
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.execute(statement);
  }

  // `CREATE TABLE IF NOT EXISTS` is a no-op against a table that already
  // exists — it can't retroactively add a column the schema gains later.
  // This is the one case that needs an explicit ALTER: a database created
  // before `needs_attention` was added to the schema.
  await ensureColumn(db, 'notes', 'needs_attention', 'INTEGER NOT NULL DEFAULT 0');
}

async function ensureColumn(
  db: Database,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const columns = await db.select<{ name: string }[]>(`PRAGMA table_info(${table})`);
  if (columns.some((c) => c.name === column)) return;
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
