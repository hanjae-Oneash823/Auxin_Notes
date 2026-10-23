import type { PlannerNode, SessionNode } from '../db/queries/planner/types.ts';
import { addDays, weekStartOf } from './routineWeek.ts';

const DAYS_IN_WEEK = 7;
const MS_PER_DAY = 86_400_000;
export const FLOW_WEEKS = 12;
export const SHARE_DAYS = 30;

export interface WeekFlow {
  /** Monday of the week, YYYY-MM-DD. */
  weekStart: string;
  created: number;
  done: number;
}

/** The local calendar day of an ISO instant, as YYYY-MM-DD. */
function localDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Tasks added and tasks finished per week for one arc, oldest to newest, ending with the week of `today`. Routine occurrences are left out. */
export function weeklyFlow(nodes: readonly PlannerNode[], arcId: string, today: string, weeks = FLOW_WEEKS): WeekFlow[] {
  const thisWeek = weekStartOf(today);
  const rows: WeekFlow[] = Array.from({ length: weeks }, (_, index) => ({ weekStart: addDays(thisWeek, (index - weeks + 1) * DAYS_IN_WEEK), created: 0, done: 0 }));
  const rowOf = (iso: string) => rows.find((row) => row.weekStart === weekStartOf(localDay(iso)));
  for (const node of nodes) {
    if (node.isRoutine || node.arcId !== arcId) continue;
    const created = rowOf(node.createdAt);
    if (created) created.created += 1;
    const finished = node.isCompleted && node.actualCompletedAt ? rowOf(node.actualCompletedAt) : undefined;
    if (finished) finished.done += 1;
  }
  return rows;
}

export interface TimeShare {
  arcMinutes: number;
  totalMinutes: number;
  /** 0 to 1; 0 when no session time was logged. */
  share: number;
}

/** How much of the session time finished in the last `days` days went to this arc. */
export function timeShare(sessionNodes: readonly SessionNode[], arcId: string, now: Date, days = SHARE_DAYS): TimeShare {
  const cutoff = now.getTime() - days * MS_PER_DAY;
  let arcMinutes = 0;
  let totalMinutes = 0;
  for (const entry of sessionNodes) {
    if (!entry.timeFinished || !entry.totalMinutes || Date.parse(entry.timeFinished) < cutoff) continue;
    totalMinutes += entry.totalMinutes;
    if (entry.arcId === arcId) arcMinutes += entry.totalMinutes;
  }
  return { arcMinutes, totalMinutes, share: totalMinutes === 0 ? 0 : arcMinutes / totalMinutes };
}

/** How many tasks were open at the end of each week, working backwards from today's open count through each week's added and finished tasks. */
export function openTrend(flow: readonly WeekFlow[], openNow: number): number[] {
  const open = new Array<number>(flow.length);
  let running = openNow;
  for (let index = flow.length - 1; index >= 0; index -= 1) {
    open[index] = running;
    running -= flow[index].created - flow[index].done;
  }
  return open;
}
