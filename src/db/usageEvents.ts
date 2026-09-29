import { getUsageDb } from './usageClient';

export type UsageEventType = 'create' | 'edit' | 'delete' | 'delete_folder' | 'rename';

export interface LogUsageEventInput {
  type: UsageEventType;
  /** Vault-relative path at the time of the event — not resolved via a
   *  note id, so a later history view still reads correctly after the
   *  note itself is gone. */
  path: string;
  title: string;
  detail?: Record<string, unknown>;
}

/**
 * Appends one row to usage.sqlite's `events` table. Callers should treat
 * this as fire-and-forget (`void logUsageEvent(...).catch(...)`) — a
 * usage-log failure must never block or throw through the real action
 * (note creation/deletion/etc) it's attached to.
 */
export async function logUsageEvent(vaultRoot: string, input: LogUsageEventInput): Promise<void> {
  const db = await getUsageDb(vaultRoot);
  await db.execute(
    'INSERT INTO events (event_type, path, title, occurred_at, detail) VALUES (?, ?, ?, ?, ?)',
    [input.type, input.path, input.title, new Date().toISOString(), input.detail ? JSON.stringify(input.detail) : null],
  );
}
