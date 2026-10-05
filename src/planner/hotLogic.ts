import type { PlannerNode, Pool } from '../db/queries/planner/types.ts';
import { localDateKey } from '../db/queries/planner/util.ts';
import { offsetDateKey, plannedDateOf, plannedTimeOf, todayKey } from './nodeDerived.ts';

export interface Badge { label: string; color: string }

export interface HotBuckets {
  events: readonly PlannerNode[];
  hot: readonly PlannerNode[];
  done: readonly PlannerNode[];
}

/** How many days ahead the dashboard lists events (today included). */
export const UPCOMING_EVENT_DAYS = 7;

const byStart = (a: PlannerNode, b: PlannerNode) => (a.plannedStartAt ?? '').localeCompare(b.plannedStartAt ?? '');

/** Soonest deadline first (none last), then important, then oldest. A deadline only orders the list; it never marks anything late. */
const byDeadlineThenImportance = (a: PlannerNode, b: PlannerNode) =>
  (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || b.importanceLevel - a.importanceLevel || a.createdAt.localeCompare(b.createdAt);

/**
 * Splits nodes into the Hot dashboard's sections: events in the next week, the hot
 * pool (plus today's routine tasks), and what was completed today. Nothing is "overdue".
 */
export function bucketNodes(nodes: readonly PlannerNode[]): HotBuckets {
  const today = todayKey();
  const horizon = offsetDateKey(UPCOMING_EVENT_DAYS);
  const isOpen = (node: PlannerNode) => !node.isCompleted;
  const isToday = (node: PlannerNode) => plannedDateOf(node) === today;

  return {
    events: nodes
      .filter((node) => {
        const day = plannedDateOf(node);
        return isOpen(node) && node.nodeType === 'event' && day !== null && day >= today && day < horizon;
      })
      .sort(byStart),
    hot: nodes
      .filter((node) => isOpen(node) && node.nodeType === 'task' && (node.isRoutine ? isToday(node) : node.pool === 'hot'))
      .sort((a, b) => (plannedTimeOf(a) ?? '').localeCompare(plannedTimeOf(b) ?? '') || byDeadlineThenImportance(a, b)),
    done: nodes.filter((node) => node.isCompleted && node.actualCompletedAt !== null && localDateKey(new Date(node.actualCompletedAt)) === today),
  };
}

/** Open, non-routine tasks in one pool, in the same order as the hot list. */
export function poolNodes(nodes: readonly PlannerNode[], pool: Pool): readonly PlannerNode[] {
  return nodes
    .filter((node) => !node.isCompleted && node.nodeType === 'task' && !node.isRoutine && node.pool === pool)
    .sort(byDeadlineThenImportance);
}
