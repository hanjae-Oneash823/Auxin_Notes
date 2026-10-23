// Runnable check for the arc box's analytics:
//   node --experimental-strip-types --no-warnings src/planner/arcFlow.check.ts
import type { PlannerNode, SessionNode } from '../db/queries/planner/types.ts';
import { openTrend, timeShare, weeklyFlow } from './arcFlow.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`arcFlow check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

// 2026-03-04 is a Wednesday; its week starts Monday 2026-03-02.
const node = (partial: Partial<PlannerNode>): PlannerNode => ({ arcId: 'a', isRoutine: false, isCompleted: false, actualCompletedAt: null, createdAt: '2026-03-04T12:00:00.000Z', ...partial }) as PlannerNode;
const flow = weeklyFlow([
  node({}),
  node({ isCompleted: true, actualCompletedAt: '2026-03-04T15:00:00.000Z' }),
  node({ createdAt: '2026-02-24T12:00:00.000Z' }),
  node({ arcId: 'other' }),
  node({ isRoutine: true }),
  node({ createdAt: '2025-01-01T12:00:00.000Z' }),
], 'a', '2026-03-04', 3);

equal(flow.map((week) => week.weekStart), ['2026-02-16', '2026-02-23', '2026-03-02'], 'weeks run oldest to newest and end with this week');
equal(flow.map((week) => week.created), [0, 1, 2], 'created counts land in their week; other arcs, routines and ancient nodes are ignored');
equal(flow.map((week) => week.done), [0, 0, 1], 'completions land in the week they were finished');

equal(openTrend(flow, 5), [3, 4, 5], 'open counts rewind through each week\'s added and finished tasks');

const entry = (partial: Partial<SessionNode>): SessionNode => ({ arcId: 'a', timeFinished: '2026-03-01T12:00:00.000Z', totalMinutes: 30, ...partial }) as SessionNode;
const now = new Date('2026-03-04T12:00:00.000Z');
const share = timeShare([
  entry({}),
  entry({ arcId: 'other', totalMinutes: 90 }),
  entry({ timeFinished: '2025-12-01T12:00:00.000Z' }),
  entry({ timeFinished: null }),
], 'a', now);
equal(share, { arcMinutes: 30, totalMinutes: 120, share: 0.25 }, 'only recent finished time counts, split by arc');
equal(timeShare([], 'a', now).share, 0, 'no sessions is 0, not NaN');
console.log('arcFlow check passed');
