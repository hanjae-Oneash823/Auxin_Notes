// Runnable check for the Routines tab's week-grid logic:
//   node --experimental-strip-types --no-warnings src/planner/routineWeek.check.ts
import type { PlannerNode } from '../db/queries/planner/types.ts';
import { addDays, layoutDay, occurrenceBlocks, timeOfMinutes, weekDates, weekStartOf, type WeekBlock } from './routineWeek.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`routineWeek check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

// 2026-03-04 is a Wednesday.
equal(weekStartOf('2026-03-04'), '2026-03-02', 'the week starts on Monday');
equal(weekStartOf('2026-03-08'), '2026-03-02', 'Sunday belongs to the week that began the Monday before');
equal(weekStartOf('2026-03-02'), '2026-03-02', 'a Monday starts its own week');
equal(weekDates('2026-03-02').length, 7, 'a week has seven days');
equal(addDays('2026-02-27', 3), '2026-03-02', 'adding days crosses month ends');
equal(timeOfMinutes(9 * 60 + 5), '09:05', 'minutes format as HH:MM');

const node = (partial: Partial<PlannerNode>): PlannerNode => ({
  id: 'n', projectId: null, arcId: null, sprintId: null, title: 't', nodeType: 'task', pool: 'hot', sortOrder: null, plannedStartAt: null, dueAt: null,
  actualCompletedAt: null, estimatedDurationMinutes: null, importanceLevel: 0, isCompleted: false, isLocked: false, isPinned: false,
  isFrogPinned: false, isRoutine: false, routineId: null, createdAt: '', updatedAt: '', groupIds: [], subTotal: 0, subDone: 0, ...partial,
});

const blocks = occurrenceBlocks([
  node({ id: 'a', isRoutine: true, routineId: 'r1', plannedStartAt: '2026-03-02T07:30:00', estimatedDurationMinutes: 60, title: 'Gym' }),
  node({ id: 'b', isRoutine: true, routineId: 'r2', plannedStartAt: '2026-03-03' }),
  node({ id: 'c', nodeType: 'event', plannedStartAt: '2026-03-04T12:00:00', estimatedDurationMinutes: 45 }),
  node({ id: 'd', plannedStartAt: '2026-03-04T12:00:00' }),
], []);
equal(blocks.map((block) => [block.key, block.startMinutes, block.durationMinutes]), [
  ['a', 450, 60], ['b', null, 30],
], 'only routine occurrences become blocks; one-off events and plain tasks do not');

const block = (key: string, start: number, duration: number): WeekBlock => ({ ...blocks[0], key, startMinutes: start, durationMinutes: duration });
const layout = layoutDay([block('x', 600, 60), block('y', 630, 60), block('z', 720, 30)]);
equal(layout.map((entry) => [entry.block.key, entry.column, entry.columns]), [['x', 0, 2], ['y', 1, 2], ['z', 0, 1]], 'overlaps split into columns; a later block gets the full width');
equal(layoutDay([block('all', 0, 30), { ...block('none', 0, 30), startMinutes: null }]).length, 1, 'all-day entries are not laid out in the time grid');

console.log('routine week logic: all checks passed');
