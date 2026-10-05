import type { Habit } from '../db/queries/health/types';

export interface GoalResult {
  /** The goal as shown in the Goal column ("every day", "≥5/day", "50 total"), "—" for none. */
  label: string;
  /** Null when there's no goal, or the month is still running and the goal can't be called yet. */
  isAchieved: boolean | null;
  /** The Now column text ("12/20", "3wk", "41.5"). */
  progress: string;
  /** 0–1, for coloring the progress. */
  ratio: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const daysInMonth = (year: number, month: number): number => new Date(year, month, 0).getDate();
export const dateKey = (year: number, month: number, day: number): string => `${year}-${pad(month)}-${pad(day)}`;
const NO_GOAL: GoalResult = { label: '—', isAchieved: null, progress: '', ratio: 0 };

/** Monday-to-Sunday weeks clipped to the month, as day-of-month ranges. */
export function weeksInMonth(year: number, month: number): { start: number; end: number }[] {
  const total = daysInMonth(year, month);
  const weeks: { start: number; end: number }[] = [];
  let start = 1;
  while (start <= total) {
    const weekday = new Date(year, month - 1, start).getDay();
    const end = Math.min(start + (weekday === 0 ? 0 : 7 - weekday), total);
    weeks.push({ start, end });
    start = end + 1;
  }
  return weeks;
}

/** How a habit stands for a month. `logs` maps date → value (null for boolean ticks); `today` is a local YYYY-MM-DD. */
export function evaluateGoal(habit: Habit, logs: ReadonlyMap<string, number | null>, year: number, month: number, today: string): GoalResult {
  if (habit.goalType === 'none') return NO_GOAL;
  const total = daysInMonth(year, month);
  const isCurrentMonth = today.startsWith(`${year}-${pad(month)}-`);
  const elapsed = isCurrentMonth ? Number(today.slice(8, 10)) : total;
  const target = habit.goalValue ?? 1;
  const loggedDays = Array.from({ length: elapsed }, (_, i) => dateKey(year, month, i + 1)).filter((date) => logs.has(date));

  if (habit.valueType === 'boolean') {
    if (habit.goalType === 'every_day') {
      return { label: 'every day', isAchieved: loggedDays.length >= elapsed, progress: `${loggedDays.length}/${elapsed}`, ratio: loggedDays.length / elapsed };
    }
    if (habit.goalType === 'times_per_month') {
      return { label: `${target}×/mo`, isAchieved: loggedDays.length >= target, progress: `${loggedDays.length}/${target}`, ratio: Math.min(1, loggedDays.length / target) };
    }
    if (habit.goalType === 'times_per_week') {
      let met = 0;
      let missed = 0;
      for (const { start, end } of weeksInMonth(year, month)) {
        // Not judged: a week still running, or a month-edge stub too short to ever reach the target.
        if (end > elapsed || end - start + 1 < target) continue;
        const count = loggedDays.filter((date) => Number(date.slice(8)) >= start && Number(date.slice(8)) <= end).length;
        if (count >= target) met += 1;
        else missed += 1;
      }
      const judged = met + missed;
      return { label: `${target}×/wk`, isAchieved: isCurrentMonth ? null : missed === 0 && met > 0, progress: `${met}wk`, ratio: judged > 0 ? met / judged : 0 };
    }
    return NO_GOAL;
  }

  const values = loggedDays.map((date) => logs.get(date)).filter((value): value is number => value !== null && value !== undefined);
  const monthTotal = Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
  if (habit.goalType === 'at_least_per_day' || habit.goalType === 'at_most_per_day') {
    const isAtLeast = habit.goalType === 'at_least_per_day';
    const met = values.filter((value) => (isAtLeast ? value >= target : value <= target)).length;
    return { label: `${isAtLeast ? '≥' : '≤'}${target}/day`, isAchieved: met === elapsed, progress: `${met}d`, ratio: met / elapsed };
  }
  if (habit.goalType === 'monthly_total') {
    return { label: `${target} total`, isAchieved: monthTotal >= target, progress: `${monthTotal}`, ratio: Math.min(1, monthTotal / target) };
  }
  return NO_GOAL;
}
