import type Database from '@tauri-apps/plugin-sql';
import { ulid } from 'ulid';
import type { GoalType, Habit, HabitInput, HabitLog, HabitValueType } from './types.ts';
import { nowIso } from '../planner/util.ts';

interface HabitRow {
  id: string;
  name: string;
  color: string;
  value_type: HabitValueType;
  goal_type: GoalType;
  goal_value: number | null;
}

interface LogRow {
  habit_id: string;
  date: string;
  value: number | null;
}

const toHabit = (row: HabitRow): Habit => ({
  id: row.id, name: row.name, color: row.color, valueType: row.value_type, goalType: row.goal_type, goalValue: row.goal_value,
});

/** Habits that haven't been archived, in display order. */
export async function listHabits(db: Database): Promise<Habit[]> {
  const rows = await db.select<HabitRow[]>(
    'SELECT id, name, color, value_type, goal_type, goal_value FROM habits WHERE archived_at IS NULL ORDER BY sort_order ASC, created_at ASC',
  );
  return rows.map(toHabit);
}

export async function createHabit(db: Database, input: HabitInput): Promise<Habit> {
  const habit: Habit = { ...input, id: ulid() };
  const [{ next }] = await db.select<{ next: number }[]>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM habits WHERE archived_at IS NULL');
  await db.execute(
    'INSERT INTO habits (id, name, color, value_type, goal_type, goal_value, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [habit.id, habit.name, habit.color, habit.valueType, habit.goalType, habit.goalValue, next, nowIso()],
  );
  return habit;
}

export async function updateHabit(db: Database, id: string, input: HabitInput): Promise<void> {
  await db.execute(
    'UPDATE habits SET name = ?, color = ?, value_type = ?, goal_type = ?, goal_value = ? WHERE id = ?',
    [input.name, input.color, input.valueType, input.goalType, input.goalValue, id],
  );
}

/** Archiving hides the habit but keeps its logs. */
export async function archiveHabit(db: Database, id: string): Promise<void> {
  await db.execute('UPDATE habits SET archived_at = ? WHERE id = ?', [nowIso(), id]);
}

export async function listLogs(db: Database): Promise<HabitLog[]> {
  const rows = await db.select<LogRow[]>('SELECT habit_id, date, value FROM habit_logs ORDER BY date ASC');
  return rows.map((row) => ({ habitId: row.habit_id, date: row.date, value: row.value }));
}

/** Ticks the day if it's empty, clears it if it's ticked. */
export async function toggleBooleanLog(db: Database, habitId: string, date: string): Promise<void> {
  const { rowsAffected } = await db.execute('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?', [habitId, date]);
  if (rowsAffected > 0) return;
  await db.execute('INSERT INTO habit_logs (id, habit_id, date, value, created_at) VALUES (?, ?, ?, NULL, ?)', [ulid(), habitId, date, nowIso()]);
}

/** Sets the day's number, or clears the day when `value` is null. */
export async function setNumericLog(db: Database, habitId: string, date: string, value: number | null): Promise<void> {
  if (value === null) {
    await db.execute('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?', [habitId, date]);
    return;
  }
  await db.execute(
    `INSERT INTO habit_logs (id, habit_id, date, value, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(habit_id, date) DO UPDATE SET value = excluded.value`,
    [ulid(), habitId, date, value, nowIso()],
  );
}
