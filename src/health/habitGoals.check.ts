// Runnable check for habit goals: `node --experimental-strip-types src/health/habitGoals.check.ts`
import { evaluateGoal, weeksInMonth } from './habitGoals.ts';
import type { Habit } from '../db/queries/health/types.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`habitGoals check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

const habit = (partial: Partial<Habit>): Habit => ({ id: 'h', name: 'h', color: '#fff', valueType: 'boolean', goalType: 'every_day', goalValue: null, ...partial });
const ticks = (...days: number[]) => new Map<string, number | null>(days.map((d) => [`2026-03-${String(d).padStart(2, '0')}`, null]));
const values = (entries: Record<number, number>) => new Map<string, number | null>(Object.entries(entries).map(([d, v]) => [`2026-03-${d.padStart(2, '0')}`, v]));
const PAST = '2026-05-01';
const MID_MARCH = '2026-03-10';

// Weeks run Mon–Sun, clipped to the month (March 2026 starts on a Sunday).
equal(weeksInMonth(2026, 3).slice(0, 3), [{ start: 1, end: 1 }, { start: 2, end: 8 }, { start: 9, end: 15 }], 'weeks start on Monday');

// Boolean goals. A running month only counts the days so far.
equal(evaluateGoal(habit({ goalType: 'none' }), ticks(1, 2), 2026, 3, PAST).label, '—', 'no goal');
equal(evaluateGoal(habit({}), ticks(...Array.from({ length: 10 }, (_, i) => i + 1)), 2026, 3, MID_MARCH).isAchieved, true, 'every day, all 10 days so far');
equal(evaluateGoal(habit({}), ticks(1, 2, 3), 2026, 3, MID_MARCH).progress, '3/10', 'every day progress counts days elapsed');
equal(evaluateGoal(habit({}), ticks(1, 2, 3), 2026, 3, PAST).progress, '3/31', 'a past month counts all its days');
equal(evaluateGoal(habit({ goalType: 'times_per_month', goalValue: 3 }), ticks(1, 5, 9, 20), 2026, 3, PAST).isAchieved, true, 'times per month met');
equal(evaluateGoal(habit({ goalType: 'times_per_month', goalValue: 3 }), ticks(30), 2026, 3, MID_MARCH).progress, '0/3', 'future logs are not counted yet');

// times_per_week: only finished weeks are judged; a running month is never called.
const weekly = habit({ goalType: 'times_per_week', goalValue: 2 });
const wholeMonth = ticks(2, 3, 9, 10, 16, 17, 23, 24, 30, 31);
equal(evaluateGoal(weekly, wholeMonth, 2026, 3, PAST).isAchieved, true, 'every week has 2 (the 1-day stub week on the 1st is not judged)');
equal(evaluateGoal(weekly, ticks(2, 3), 2026, 3, PAST).isAchieved, false, 'a missed week fails the month');
equal(evaluateGoal(weekly, wholeMonth, 2026, 3, MID_MARCH).isAchieved, null, 'a running month is undecided');
equal(evaluateGoal(weekly, ticks(2, 3), 2026, 3, MID_MARCH).progress, '1wk', 'only the finished week counts');

// Numeric goals.
const run = habit({ valueType: 'numeric', goalType: 'monthly_total', goalValue: 50 });
equal(evaluateGoal(run, values({ 1: 10.5, 2: 20, 3: 20 }), 2026, 3, PAST).isAchieved, true, 'monthly total reached');
equal(evaluateGoal(run, values({ 1: 10.25, 2: 20 }), 2026, 3, PAST).progress, '30.25', 'total is rounded to 2 places');
equal(evaluateGoal(run, values({ 1: 25 }), 2026, 3, PAST).ratio, 0.5, 'ratio is progress over target');
equal(evaluateGoal(habit({ valueType: 'numeric', goalType: 'at_least_per_day', goalValue: 5 }), values({ 1: 5, 2: 4, 3: 6 }), 2026, 3, '2026-03-03').progress, '2d', 'days at least the target');
equal(evaluateGoal(habit({ valueType: 'numeric', goalType: 'at_most_per_day', goalValue: 2 }), values({ 1: 1, 2: 3 }), 2026, 3, '2026-03-02').isAchieved, false, 'a day over the cap fails it');

console.log('habitGoals: ok');
