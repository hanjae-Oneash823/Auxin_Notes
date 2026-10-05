// Runnable check for the health data layer. It runs the real migration and the
// real query modules against an in-memory SQLite (node:sqlite):
//   node --experimental-strip-types --no-warnings src/db/queries/health/health.check.ts
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type Database from '@tauri-apps/plugin-sql';
import { archiveHabit, createHabit, listHabits, listLogs, setNumericLog, toggleBooleanLog, updateHabit } from './habits.ts';
import { addSleepEntry, deleteSleepEntry, getActiveTarget, listSleepEntries, updateSleepEntry } from './sleep.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`health check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

async function throws(run: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await run();
  } catch {
    return;
  }
  throw new Error(`health check failed: ${message} (expected an error)`);
}

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec(readFileSync(new URL('../../migrations/health/0001_init.sql', import.meta.url), 'utf8'));
const db = {
  select: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).all(...(params as never[])).map((row) => ({ ...row })),
  execute: async (sql: string, params: unknown[] = []) => {
    const result = sqlite.prepare(sql).run(...(params as never[]));
    return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
  },
} as unknown as Database;

// Habits: created in order, edited, archived (kept in the table, hidden from the list).
const run = await createHabit(db, { name: 'running', color: '#40c4c4', valueType: 'numeric', goalType: 'monthly_total', goalValue: 50 });
const read = await createHabit(db, { name: 'read', color: '#d4b84a', valueType: 'boolean', goalType: 'none', goalValue: null });
equal((await listHabits(db)).map((habit) => habit.name), ['running', 'read'], 'habits list in creation order');
await updateHabit(db, read.id, { name: 'reading', color: '#fff', valueType: 'boolean', goalType: 'times_per_week', goalValue: 3 });
equal((await listHabits(db))[1], { id: read.id, name: 'reading', color: '#fff', valueType: 'boolean', goalType: 'times_per_week', goalValue: 3 }, 'update replaces every field');
await throws(() => createHabit(db, { name: 'x', color: '#000', valueType: 'boolean', goalType: 'bogus' as never, goalValue: null }), 'a goal type outside the CHECK is rejected');

// Logs: toggle ticks then clears; numeric upserts and clears.
await toggleBooleanLog(db, read.id, '2026-03-02');
equal(await listLogs(db), [{ habitId: read.id, date: '2026-03-02', value: null }], 'first toggle ticks the day');
await toggleBooleanLog(db, read.id, '2026-03-02');
equal(await listLogs(db), [], 'second toggle clears it');
await setNumericLog(db, run.id, '2026-03-02', 5.5);
await setNumericLog(db, run.id, '2026-03-02', 7);
equal(await listLogs(db), [{ habitId: run.id, date: '2026-03-02', value: 7 }], 'setting a day again overwrites, one row per day');
await setNumericLog(db, run.id, '2026-03-02', null);
equal(await listLogs(db), [], 'null clears the day');

await setNumericLog(db, run.id, '2026-03-03', 4);
await archiveHabit(db, run.id);
equal((await listHabits(db)).map((habit) => habit.name), ['reading'], 'an archived habit leaves the list');
equal((await listLogs(db)).length, 1, 'but keeps its logs');

// Sleep: newest first, one night per date, wake after bedtime, naps hidden.
await addSleepEntry(db, { date: '2026-03-01', sleepStart: '2026-03-01T23:30:00', wakeTime: '2026-03-02T07:00:00', notes: '' });
await addSleepEntry(db, { date: '2026-03-02', sleepStart: '2026-03-03T01:00:00', wakeTime: '2026-03-03T08:30:00', notes: 'late' });
sqlite.exec("INSERT INTO sleep_entries (date, sleep_start, wake_time, is_nap, notes, created_at) VALUES ('2026-03-03', '2026-03-03T14:00:00', '2026-03-03T14:30:00', 1, '', '2026-03-03T00:00:00.000Z')");
equal((await listSleepEntries(db)).map((entry) => entry.date), ['2026-03-02', '2026-03-01'], 'newest night first, naps left out');
await throws(() => addSleepEntry(db, { date: '2026-03-01', sleepStart: '2026-03-01T22:00:00', wakeTime: '2026-03-02T06:00:00', notes: '' }), 'a second entry for a night');
await throws(() => addSleepEntry(db, { date: '2026-03-09', sleepStart: '2026-03-09T23:00:00', wakeTime: '2026-03-09T22:00:00', notes: '' }), 'wake before bedtime');

// Editing a night: it can keep its own date, can't take another night's, and must still wake after bedtime. Naps are never touched.
const [march2, march1] = await listSleepEntries(db);
await updateSleepEntry(db, march2.id, { date: '2026-03-02', sleepStart: '2026-03-03T00:30:00', wakeTime: '2026-03-03T08:00:00', notes: 'edited' });
equal((await listSleepEntries(db))[0], { id: march2.id, date: '2026-03-02', sleepStart: '2026-03-03T00:30:00', wakeTime: '2026-03-03T08:00:00', notes: 'edited' }, 'update keeps the date and changes the rest');
await updateSleepEntry(db, march1.id, { date: '2026-03-05', sleepStart: '2026-03-05T23:00:00', wakeTime: '2026-03-06T07:00:00', notes: '' });
equal((await listSleepEntries(db)).map((entry) => entry.date), ['2026-03-05', '2026-03-02'], 'a night can move to a free date');
await throws(() => updateSleepEntry(db, march1.id, { date: '2026-03-02', sleepStart: '2026-03-02T23:00:00', wakeTime: '2026-03-03T07:00:00', notes: '' }), 'moving onto another logged night');
await throws(() => updateSleepEntry(db, march1.id, { date: '2026-03-05', sleepStart: '2026-03-05T23:00:00', wakeTime: '2026-03-05T22:00:00', notes: '' }), 'editing so wake is before bedtime');
await deleteSleepEntry(db, march1.id);
equal((await listSleepEntries(db)).map((entry) => entry.date), ['2026-03-02'], 'delete removes the night');
const [{ naps }] = sqlite.prepare('SELECT COUNT(*) AS naps FROM sleep_entries WHERE is_nap = 1').all() as { naps: number }[];
await deleteSleepEntry(db, 3);
equal(sqlite.prepare('SELECT COUNT(*) AS naps FROM sleep_entries WHERE is_nap = 1').all()[0].naps, naps, 'delete leaves naps alone');

// Target: the newest row wins.
equal(await getActiveTarget(db), null, 'no target yet');
sqlite.exec("INSERT INTO sleep_targets (target_sleep_start, target_duration, set_at) VALUES ('01:00', 7.5, '2026-04-09T12:00:00.000Z'), ('01:30', 7, '2026-05-01T07:00:00.000Z')");
equal(await getActiveTarget(db), { targetSleepStart: '01:30', targetDuration: 7 }, 'latest target');

console.log('health: ok');
