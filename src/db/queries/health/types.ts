// Domain types for health.sqlite (see migrations/health/0001_init.sql).
// Field names mirror the columns in camelCase.

export type HabitValueType = 'boolean' | 'numeric';
export type BooleanGoalType = 'every_day' | 'times_per_month' | 'times_per_week' | 'none';
export type NumericGoalType = 'at_least_per_day' | 'at_most_per_day' | 'monthly_total' | 'none';
export type GoalType = BooleanGoalType | NumericGoalType;

export interface Habit {
  id: string;
  name: string;
  color: string;
  valueType: HabitValueType;
  goalType: GoalType;
  goalValue: number | null;
}

export type HabitInput = Omit<Habit, 'id'>;

/** One habit on one day (local YYYY-MM-DD). `value` is null for boolean habits. */
export interface HabitLog {
  habitId: string;
  date: string;
  value: number | null;
}

export interface SleepEntry {
  id: number;
  /** The evening the night began (local YYYY-MM-DD), even when bedtime is after midnight. */
  date: string;
  /** Local wall-clock YYYY-MM-DDTHH:MM:SS, no timezone. */
  sleepStart: string;
  wakeTime: string;
  notes: string;
}

export type SleepEntryInput = Omit<SleepEntry, 'id'>;

export interface SleepTarget {
  /** HH:MM */
  targetSleepStart: string;
  targetDuration: number;
}
