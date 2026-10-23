import type { Arc, PlannerNode } from '../db/queries/planner/types.ts';

// Pure logic behind the Routines tab's week grid (see routineWeek.check.ts).

/** 0 = Sunday … 6 = Saturday; the grid starts its week here (Monday). */
const WEEK_STARTS_ON = 1;
const DAYS_IN_WEEK = 7;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
/** How long a block with no duration is drawn. */
export const DEFAULT_BLOCK_MINUTES = 30;
const NEUTRAL_COLOR = '#9a9a9a';

/** A routine occurrence drawn on the calendar. `startMinutes` null means an all-day entry (no time). */
export interface WeekBlock {
  key: string;
  /** The generated node. */
  nodeId: string;
  routineId: string;
  title: string;
  date: string;
  startMinutes: number | null;
  durationMinutes: number;
  color: string;
  isDone: boolean;
  isImportant: boolean;
}

const dateAtNoon = (key: string): Date => new Date(`${key}T12:00:00`);

export function addDays(key: string, days: number): string {
  const date = dateAtNoon(key);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The first day of the week containing `key`. */
export function weekStartOf(key: string): string {
  const behind = (dateAtNoon(key).getDay() - WEEK_STARTS_ON + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  return addDays(key, -behind);
}

export const weekDates = (startKey: string): string[] => Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(startKey, index));

/** The seven dates of the week `weekOffset` weeks from the one containing `today` (YYYY-MM-DD). */
export const weekDatesAt = (weekOffset: number, today: string): string[] => weekDates(addDays(weekStartOf(today), weekOffset * DAYS_IN_WEEK));

export const minutesOfTime = (time: string): number => Number(time.slice(0, 2)) * MINUTES_PER_HOUR + Number(time.slice(3, 5));

export function timeOfMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, minutes));
  return `${String(Math.floor(clamped / MINUTES_PER_HOUR)).padStart(2, '0')}:${String(clamped % MINUTES_PER_HOUR).padStart(2, '0')}`;
}

/** Start minute of a node's planned time, or null when it only has a date. */
function startMinutesOf(plannedStartAt: string | null): number | null {
  return plannedStartAt && plannedStartAt.length >= 16 ? minutesOfTime(plannedStartAt.slice(11, 16)) : null;
}

const colorOf = (arcs: readonly Arc[], arcId: string | null): string => arcs.find((arc) => arc.id === arcId)?.colorHex ?? NEUTRAL_COLOR;

/** Every generated routine occurrence, as grid blocks (any week). */
export function occurrenceBlocks(nodes: readonly PlannerNode[], arcs: readonly Arc[]): WeekBlock[] {
  return nodes.flatMap((node): WeekBlock[] => {
    const date = node.plannedStartAt?.slice(0, 10);
    if (!date || !node.isRoutine || node.routineId === null) return [];
    return [{
      key: node.id, nodeId: node.id, routineId: node.routineId, title: node.title, date,
      startMinutes: startMinutesOf(node.plannedStartAt), durationMinutes: node.estimatedDurationMinutes ?? DEFAULT_BLOCK_MINUTES,
      color: colorOf(arcs, node.arcId), isDone: node.isCompleted, isImportant: node.importanceLevel === 1,
    }];
  });
}

export interface PlacedBlock { block: WeekBlock; column: number; columns: number }

/** Side-by-side columns for overlapping blocks in one day: each cluster of overlaps is split evenly. */
export function layoutDay(blocks: readonly WeekBlock[]): PlacedBlock[] {
  const timed = blocks
    .filter((block) => block.startMinutes !== null)
    .sort((a, b) => (a.startMinutes as number) - (b.startMinutes as number) || b.durationMinutes - a.durationMinutes);
  const placed: PlacedBlock[] = [];
  let cluster: { block: WeekBlock; column: number }[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const columns = Math.max(1, ...cluster.map((entry) => entry.column + 1));
    placed.push(...cluster.map((entry) => ({ ...entry, columns })));
    cluster = [];
  };

  for (const block of timed) {
    const start = block.startMinutes as number;
    if (cluster.length > 0 && start >= clusterEnd) flush();
    const taken = new Set(cluster.filter((entry) => (entry.block.startMinutes as number) + entry.block.durationMinutes > start).map((entry) => entry.column));
    let column = 0;
    while (taken.has(column)) column += 1;
    cluster.push({ block, column });
    clusterEnd = Math.max(clusterEnd, start + block.durationMinutes);
  }
  flush();
  return placed;
}
