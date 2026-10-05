import type { PlannerNode, WorkSession } from '../../db/queries/planner/types';

const MINUTE_MS = 60_000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
/** A task count at which the calendar heat reaches its hottest colour (Mycelium: 1..10). */
const HEAT_SPAN = 9;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export const dateKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export interface DayCompletions {
  count: number;
  titles: readonly string[];
}

/** Completed nodes grouped by the local day they were finished. */
export function completionsByDay(nodes: readonly PlannerNode[]): Map<string, DayCompletions> {
  const days = new Map<string, DayCompletions>();
  for (const node of nodes) {
    if (!node.isCompleted || !node.actualCompletedAt) continue;
    const key = dateKey(new Date(node.actualCompletedAt));
    const day = days.get(key);
    days.set(key, { count: (day?.count ?? 0) + 1, titles: [...(day?.titles ?? []), node.title] });
  }
  return days;
}

/** Mycelium's heat gradient: teal → green → yellow → orange as the day's count rises. */
const HEAT_STOPS: readonly { t: number; rgb: readonly [number, number, number]; a: number }[] = [
  { t: 0, rgb: [0, 196, 167], a: 0.18 },
  { t: 0.33, rgb: [74, 222, 128], a: 0.32 },
  { t: 0.66, rgb: [245, 200, 66], a: 0.46 },
  { t: 1, rgb: [255, 107, 53], a: 0.6 },
];

export function heatColor(count: number): string {
  if (count <= 0) return 'transparent';
  const t = Math.min((count - 1) / HEAT_SPAN, 1);
  const upper = Math.max(HEAT_STOPS.findIndex((stop) => t <= stop.t), 1);
  const to = HEAT_STOPS[upper];
  const from = HEAT_STOPS[upper - 1];
  const f = (t - from.t) / (to.t - from.t);
  const mix = (a: number, b: number) => a + (b - a) * f;
  const [r, g, b] = from.rgb.map((channel, i) => Math.round(mix(channel, to.rgb[i])));
  return `rgba(${r},${g},${b},${mix(from.a, to.a).toFixed(2)})`;
}

/** A month as calendar cells: leading blanks (null), the days 1..n, trailing blanks to full weeks. */
export function monthCells(year: number, month: number): (number | null)[] {
  const leading = new Date(year, month, 1).getDay();
  const length = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(leading).fill(null), ...Array.from({ length }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export interface FootprintPoint {
  date: string;
  /** SU..SA */
  day: string;
  tasks: number;
  sessionMins: number;
  eventMins: number;
}

/** The last `days` days ending today: tasks done, session minutes and event minutes per day (Mycelium's 7-day footprint). */
export function footprint(nodes: readonly PlannerNode[], sessions: readonly WorkSession[], today: Date, days = 7): FootprintPoint[] {
  const done = completionsByDay(nodes);
  const sessionMins = new Map<string, number>();
  for (const session of sessions) {
    if (!session.actualStart) continue;
    const end = session.actualEnd ? Date.parse(session.actualEnd) : today.getTime();
    const mins = Math.max(0, Math.round((end - Date.parse(session.actualStart)) / MINUTE_MS));
    sessionMins.set(session.plannedDate, (sessionMins.get(session.plannedDate) ?? 0) + mins);
  }
  const eventMins = new Map<string, number>();
  for (const node of nodes) {
    if (node.nodeType !== 'event' || !node.plannedStartAt) continue;
    const key = node.plannedStartAt.slice(0, 10);
    eventMins.set(key, (eventMins.get(key) ?? 0) + (node.estimatedDurationMinutes ?? 0));
  }
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1) + i);
    const key = dateKey(day);
    return { date: key, day: WEEKDAYS[day.getDay()], tasks: done.get(key)?.count ?? 0, sessionMins: sessionMins.get(key) ?? 0, eventMins: eventMins.get(key) ?? 0 };
  });
}

/** Mycelium's analytics palette: tasks, sessions, events. */
export const TASK_COLOR = '#00c4a7';
export const SESSION_COLOR = '#f5c842';
export const EVENT_MINUTES_COLOR = '#c084fc';
