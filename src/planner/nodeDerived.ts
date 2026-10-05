import type { Arc, PlannerNode } from '../db/queries/planner/types';
import { localDateKey } from '../db/queries/planner/util.ts';

// Everything the planner UI derives from a stored node. Mycelium stored
// is_overdue / computed_urgency_level as columns; here they are computed.

/** UI-level kind. Stored nodes are only task/event; an assignment is a task with a due date. */
export type NodeKind = 'assignment' | 'task' | 'event';

export const NODE_KINDS: readonly NodeKind[] = ['assignment', 'task', 'event'];
export const OVERDUE_COLOR = '#ff3b3b';
export const MISSED_COLOR = '#f5c842';
export const EVENT_COLOR = '#888888';
export const NEUTRAL_COLOR = '#9a9a9a';

export const KIND_COLORS: Record<NodeKind, string> = {
  assignment: 'var(--accent-warning)',
  task: 'var(--accent-link)',
  event: 'var(--accent-info)',
};

export function offsetDateKey(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return localDateKey(date);
}

export const todayKey = (): string => localDateKey();

/** YYYY-MM-DD part of planned_start_at. */
export const plannedDateOf = (node: Pick<PlannerNode, 'plannedStartAt'>): string | null => node.plannedStartAt?.slice(0, 10) ?? null;

/** HH:MM part of planned_start_at, or null for date-only values. */
export function plannedTimeOf(node: Pick<PlannerNode, 'plannedStartAt'>): string | null {
  const at = node.plannedStartAt;
  return at && at.length >= 16 ? at.slice(11, 16) : null;
}

export function kindOf(node: Pick<PlannerNode, 'nodeType' | 'dueAt'>): NodeKind {
  if (node.nodeType === 'event') return 'event';
  return node.dueAt ? 'assignment' : 'task';
}

/** Mycelium's is_overdue: the deadline passed, or a routine occurrence's planned day passed. */
export function isOverdue(node: PlannerNode): boolean {
  if (node.isCompleted) return false;
  const today = todayKey();
  const plannedDate = plannedDateOf(node);
  return (node.dueAt !== null && node.dueAt < today) || (node.isRoutine && plannedDate !== null && plannedDate < today);
}

/** Mycelium's is_missed_schedule: a one-off node with no deadline whose planned day has passed. */
export function isMissed(node: PlannerNode): boolean {
  const plannedDate = plannedDateOf(node);
  return !node.isCompleted && !isOverdue(node) && node.dueAt === null && !node.isRoutine && plannedDate !== null && plannedDate < todayKey();
}

/** Mycelium's dot color: overdue red, missed amber, events gray, otherwise the arc color. */
export function nodeColor(node: PlannerNode, arcs: readonly Arc[]): string {
  if (isOverdue(node)) return OVERDUE_COLOR;
  if (isMissed(node)) return MISSED_COLOR;
  if (node.nodeType === 'event') return EVENT_COLOR;
  return arcs.find((arc) => arc.id === node.arcId)?.colorHex ?? NEUTRAL_COLOR;
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function addMinutesToTime(start: string, minutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** One-line summary shown on a list row. */
export function summarize(node: PlannerNode): string {
  const parts: string[] = [];
  const time = plannedTimeOf(node);
  const estimate = node.estimatedDurationMinutes;
  if (time) {
    parts.push(estimate ? `${time} – ${addMinutesToTime(time, estimate)}` : time);
  } else if (estimate) {
    parts.push(`~${formatMinutes(estimate)}`);
  }
  if (node.dueAt) parts.push(`due ${node.dueAt === todayKey() ? 'today' : node.dueAt}`);
  return parts.join(' · ');
}
