// Runnable check for the planner analytics maths: `node --experimental-strip-types src/planner/analytics/analyticsData.check.ts`
import { completionsByDay, footprint, heatColor, monthCells } from './analyticsData.ts';
import type { PlannerNode, WorkSession } from '../../db/queries/planner/types.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`analyticsData check failed: ${message} (got ${actual}, expected ${expected})`);
}

const node = (patch: Partial<PlannerNode>): PlannerNode => ({
  id: 'n', projectId: null, arcId: null, title: 't', nodeType: 'task', pool: 'hot', plannedStartAt: null, dueAt: null, actualCompletedAt: null,
  estimatedDurationMinutes: null, importanceLevel: 0, isCompleted: false, isLocked: false, isPinned: false, isFrogPinned: false,
  isRoutine: false, routineId: null, createdAt: '', updatedAt: '', groupIds: [], subTotal: 0, subDone: 0, ...patch,
});
const session = (patch: Partial<WorkSession>): WorkSession => ({
  id: 's', title: '', locationId: null, locationName: null, plannedDate: '2026-03-05', actualStart: null, actualEnd: null, status: 'completed', createdAt: '', ...patch,
});

const noon = new Date(2026, 2, 5, 12, 0);
const today = new Date(2026, 2, 5, 18, 0);

const done = completionsByDay([
  node({ title: 'a', isCompleted: true, actualCompletedAt: noon.toISOString() }),
  node({ title: 'b', isCompleted: true, actualCompletedAt: noon.toISOString() }),
  node({ title: 'open', isCompleted: false, actualCompletedAt: noon.toISOString() }),
]);
equal(done.get('2026-03-05')?.count, 2, 'completions group by local day and skip open nodes');
equal(done.get('2026-03-05')?.titles.join(','), 'a,b', 'titles are kept for the tooltip');

equal(heatColor(0), 'transparent', 'no completions is uncoloured');
equal(heatColor(1), 'rgba(0,196,167,0.18)', 'one completion is the coolest stop');
equal(heatColor(99), 'rgba(255,107,53,0.60)', 'many completions clamp to the hottest stop');

const cells = monthCells(2026, 2); // March 2026 starts on a Sunday
equal(cells.length % 7, 0, 'month grid is whole weeks');
equal(cells[0], 1, 'March 2026 starts on Sunday');
equal(cells.filter((cell) => cell !== null).length, 31, 'all days present');

const points = footprint(
  [
    node({ isCompleted: true, actualCompletedAt: noon.toISOString() }),
    node({ nodeType: 'event', plannedStartAt: '2026-03-04T09:00:00', estimatedDurationMinutes: 90 }),
  ],
  [session({ plannedDate: '2026-03-05', actualStart: new Date(2026, 2, 5, 9).toISOString(), actualEnd: new Date(2026, 2, 5, 10, 30).toISOString() })],
  today,
);
equal(points.length, 7, 'seven days');
equal(points[6].date, '2026-03-05', 'ends today');
equal(points[6].tasks, 1, 'today task count');
equal(points[6].sessionMins, 90, 'session minutes are end minus start');
equal(points[5].eventMins, 90, 'event minutes come from the estimate');
console.log('analyticsData: ok');
