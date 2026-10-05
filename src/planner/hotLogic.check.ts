// Runnable check for the Hot dashboard's bucketing:
//   node --experimental-strip-types --no-warnings src/planner/hotLogic.check.ts
import type { PlannerNode } from '../db/queries/planner/types.ts';
import { bucketNodes, poolNodes } from './hotLogic.ts';
import { offsetDateKey } from './nodeDerived.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`hotLogic check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

const node = (patch: Partial<PlannerNode>): PlannerNode => ({
  id: 'n', projectId: null, arcId: null, title: 't', nodeType: 'task', pool: 'hot', plannedStartAt: null, dueAt: null, actualCompletedAt: null,
  estimatedDurationMinutes: null, importanceLevel: 0, isCompleted: false, isLocked: false, isPinned: false, isFrogPinned: false,
  isRoutine: false, routineId: null, createdAt: '', updatedAt: '', groupIds: [], subTotal: 0, subDone: 0, ...patch,
});
const ids = (list: readonly PlannerNode[]) => list.map((n) => n.id);

const nodes = [
  node({ id: 'hot-plain' }),
  node({ id: 'hot-important', importanceLevel: 1 }),
  node({ id: 'hot-due-soon', dueAt: offsetDateKey(2) }),
  node({ id: 'hot-past-due', dueAt: offsetDateKey(-3) }),
  node({ id: 'cold', pool: 'cold' }),
  node({ id: 'inbox', pool: 'inbox' }),
  node({ id: 'event-today', nodeType: 'event', plannedStartAt: `${offsetDateKey(0)}T09:00:00` }),
  node({ id: 'event-later', nodeType: 'event', plannedStartAt: `${offsetDateKey(3)}T09:00:00` }),
  node({ id: 'event-far', nodeType: 'event', plannedStartAt: `${offsetDateKey(30)}T09:00:00` }),
  node({ id: 'event-past', nodeType: 'event', plannedStartAt: `${offsetDateKey(-1)}T09:00:00` }),
  node({ id: 'routine-today', isRoutine: true, pool: 'cold', plannedStartAt: offsetDateKey(0) }),
  node({ id: 'routine-yesterday', isRoutine: true, plannedStartAt: offsetDateKey(-1) }),
];

const { events, hot } = bucketNodes(nodes);
equal(ids(events), ['event-today', 'event-later'], 'events: today through the next week, soonest first');
equal(ids(hot), ['hot-past-due', 'hot-due-soon', 'hot-important', 'hot-plain', 'routine-today'], 'hot: by deadline, then importance; today\'s routine task joins; yesterday\'s does not');
equal(ids(poolNodes(nodes, 'cold')), ['cold'], 'cold pool excludes routine occurrences');
equal(ids(poolNodes(nodes, 'inbox')), ['inbox'], 'inbox pool');
console.log('hotLogic: all checks passed');
