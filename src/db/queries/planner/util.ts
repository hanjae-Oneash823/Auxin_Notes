import type Database from '@tauri-apps/plugin-sql';

export type SqlValue = string | number | null;

export const nowIso = (): string => new Date().toISOString();

/** Local calendar date as YYYY-MM-DD. */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const toBool = (value: number | null | undefined): boolean => value === 1;
export const fromBool = (value: boolean): number => (value ? 1 : 0);

/** `?, ?, ?` for an IN list of `count` values. */
export const placeholders = (count: number): string => Array.from({ length: count }, () => '?').join(', ');

/**
 * UPDATE one row by id, setting only the columns whose value is not undefined.
 * `table` and the column names must be string literals from the calling
 * module, never user input — they are interpolated into the SQL.
 */
export async function patchRow(
  db: Database,
  table: string,
  id: string,
  columns: Record<string, SqlValue | undefined>,
): Promise<void> {
  const entries = Object.entries(columns).filter(([, value]) => value !== undefined) as [string, SqlValue][];
  if (entries.length === 0) return;
  const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
  await db.execute(`UPDATE ${table} SET ${assignments} WHERE id = ?`, [...entries.map(([, value]) => value), id]);
}
