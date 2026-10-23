// Runnable check for the Arcs & projects tab's derived numbers:
//   node --experimental-strip-types --no-warnings src/planner/arcDerived.check.ts
import type { PlannerNode } from '../db/queries/planner/types.ts';
import { agoLabel, fractionDone, latestCompletion, tally } from './arcDerived.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`arcDerived check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

const node = (partial: Partial<PlannerNode>): PlannerNode => ({ isCompleted: false, isRoutine: false, dueAt: null, ...partial }) as PlannerNode;
const nodes = [
  node({ isCompleted: true }),
  node({ dueAt: '2026-01-01' }),
  node({ dueAt: '2026-12-31' }),
  node({ isRoutine: true, dueAt: '2026-01-01' }),
];
const result = tally(nodes, () => true);
equal(result, { done: 1, open: 2, total: 3 }, 'routine occurrences are left out of the counts');
equal(fractionDone(result), 1 / 3, 'fraction is done over total');
equal(fractionDone(tally([], () => true)), 0, 'an empty set is 0, not NaN');
const now = new Date('2026-06-01T12:00:00.000Z');
equal(agoLabel('2026-06-01T01:00:00.000Z', now), 'today', 'same day');
equal(agoLabel('2026-05-31T09:00:00.000Z', now), 'yesterday', 'one day back');
equal(agoLabel('2026-05-20T12:00:00.000Z', now), '12 days ago', 'days');
equal(agoLabel('2026-03-01T12:00:00.000Z', now), '3 months ago', 'months');
equal(agoLabel('2024-05-01T12:00:00.000Z', now), '2 years ago', 'years');
equal(latestCompletion([node({ isCompleted: true, actualCompletedAt: '2026-01-02T00:00:00.000Z' }), node({ isCompleted: true, actualCompletedAt: '2026-03-02T00:00:00.000Z' }), node({ isRoutine: true, isCompleted: true, actualCompletedAt: '2027-01-01T00:00:00.000Z' })], () => true), '2026-03-02T00:00:00.000Z', 'newest finished one-off wins; routines ignored');
equal(latestCompletion([], () => true), null, 'nothing finished is null');
console.log('arcDerived check passed');
