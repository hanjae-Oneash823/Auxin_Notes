import type Database from '@tauri-apps/plugin-sql';
import type { SleepEntry, SleepEntryInput, SleepTarget } from './types.ts';
import { nowIso } from '../planner/util.ts';

interface EntryRow {
  id: number;
  date: string;
  sleep_start: string;
  wake_time: string;
  notes: string;
}

interface TargetRow {
  target_sleep_start: string;
  target_duration: number;
}

/** Main sleeps only (naps are stored but never shown), newest night first. */
export async function listSleepEntries(db: Database): Promise<SleepEntry[]> {
  const rows = await db.select<EntryRow[]>('SELECT id, date, sleep_start, wake_time, notes FROM sleep_entries WHERE is_nap = 0 ORDER BY sleep_start DESC');
  return rows.map((row) => ({ id: row.id, date: row.date, sleepStart: row.sleep_start, wakeTime: row.wake_time, notes: row.notes }));
}

/** One night per date, and the wake time after bedtime. `ownId` is the entry being edited, which doesn't clash with itself. */
async function assertValidNight(db: Database, input: SleepEntryInput, ownId: number | null): Promise<void> {
  const taken = await db.select<{ id: number }[]>('SELECT id FROM sleep_entries WHERE date = ? AND is_nap = 0 AND id IS NOT ?', [input.date, ownId]);
  if (taken.length > 0) throw new Error(`Sleep for the night of ${input.date} is already logged.`);
  if (Date.parse(input.wakeTime) <= Date.parse(input.sleepStart)) throw new Error('Wake time must be after bedtime.');
}

export async function addSleepEntry(db: Database, input: SleepEntryInput): Promise<void> {
  await assertValidNight(db, input, null);
  await db.execute(
    'INSERT INTO sleep_entries (date, sleep_start, wake_time, is_nap, notes, created_at) VALUES (?, ?, ?, 0, ?, ?)',
    [input.date, input.sleepStart, input.wakeTime, input.notes, nowIso()],
  );
}

export async function updateSleepEntry(db: Database, id: number, input: SleepEntryInput): Promise<void> {
  await assertValidNight(db, input, id);
  await db.execute('UPDATE sleep_entries SET date = ?, sleep_start = ?, wake_time = ?, notes = ? WHERE id = ? AND is_nap = 0', [
    input.date, input.sleepStart, input.wakeTime, input.notes, id,
  ]);
}

export async function deleteSleepEntry(db: Database, id: number): Promise<void> {
  await db.execute('DELETE FROM sleep_entries WHERE id = ? AND is_nap = 0', [id]);
}

/** The newest target, or null before one is set. */
export async function getActiveTarget(db: Database): Promise<SleepTarget | null> {
  const rows = await db.select<TargetRow[]>('SELECT target_sleep_start, target_duration FROM sleep_targets ORDER BY set_at DESC, id DESC LIMIT 1');
  return rows[0] ? { targetSleepStart: rows[0].target_sleep_start, targetDuration: rows[0].target_duration } : null;
}
