import type { PlannerNode } from '../db/queries/planner/types';

export interface Tally {
  done: number;
  open: number;
  total: number;
}

/** Counts the one-off nodes `match` picks; routine occurrences are left out (there is a year of them). */
export function tally(nodes: readonly PlannerNode[], match: (node: PlannerNode) => boolean): Tally {
  const mine = nodes.filter((node) => !node.isRoutine && match(node));
  const done = mine.filter((node) => node.isCompleted).length;
  return { done, open: mine.length - done, total: mine.length };
}

export const fractionDone = ({ done, total }: Tally): number => (total === 0 ? 0 : done / total);

const MS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

/** `today`, `yesterday`, `3 days ago`, `8 months ago`, `2 years ago`. */
export function agoLabel(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / MS_PER_DAY);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < DAYS_PER_MONTH) return `${days} days ago`;
  const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'} ago`;
  if (days < DAYS_PER_YEAR) return plural(Math.floor(days / DAYS_PER_MONTH), 'month');
  return plural(Math.floor(days / DAYS_PER_YEAR), 'year');
}

/** When the newest finished one-off task matching `match` was completed, or null if none. */
export function latestCompletion(nodes: readonly PlannerNode[], match: (node: PlannerNode) => boolean): string | null {
  let latest: string | null = null;
  for (const node of nodes) {
    if (node.isRoutine || !node.isCompleted || !node.actualCompletedAt || !match(node)) continue;
    if (latest === null || node.actualCompletedAt > latest) latest = node.actualCompletedAt;
  }
  return latest;
}
