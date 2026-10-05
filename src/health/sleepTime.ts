import type { SleepEntry } from '../db/queries/health/types';

/** The log bar covers 22:00 → 12:00 next day: where a night almost always falls. */
const BAR_START_MIN = 22 * 60;
const BAR_SPAN_MIN = 14 * 60;
const SNAP_MIN = 5;
const MIN_PER_DAY = 24 * 60;
/** A bedtime before this hour is after midnight, so it belongs to the next calendar day. */
const NEXT_DAY_BEFORE_HOUR = 14;
const HOUR_MS = 3_600_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Position (0–1) of an hour of the day along the bar. */
export function hourToPos(hour: number): number {
  const absolute = hour >= 22 ? hour : hour + 24;
  return (absolute * 60 - BAR_START_MIN) / BAR_SPAN_MIN;
}

/** Clamps to the bar and snaps to the nearest 5 minutes. */
export function snapPos(pos: number): number {
  const snapped = Math.round((pos * BAR_SPAN_MIN) / SNAP_MIN) * SNAP_MIN;
  return Math.max(0, Math.min(1, snapped / BAR_SPAN_MIN));
}

export function posToHHMM(pos: number): string {
  const total = BAR_START_MIN + Math.round(pos * BAR_SPAN_MIN);
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

/** "7h 30m" between two bar positions. */
export function barSpanLabel(fromPos: number, toPos: number): string {
  const minutes = Math.round(Math.abs(toPos - fromPos) * BAR_SPAN_MIN);
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

/** A local YYYY-MM-DD shifted by whole days. */
export function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The two instants of a night. `date` is the evening it began: a 01:30 bedtime lands on the next
 *  calendar day, and a wake time earlier on the clock than bedtime (or before 14:00 after an evening bedtime) is the day after. */
export function buildNight(date: string, sleepHHMM: string, wakeHHMM: string): { sleepStart: string; wakeTime: string } {
  const sleepHour = Number(sleepHHMM.slice(0, 2));
  const wakeHour = Number(wakeHHMM.slice(0, 2));
  const sleepDate = sleepHour < NEXT_DAY_BEFORE_HOUR ? addDays(date, 1) : date;
  const isWakeNextDay = (sleepHour >= NEXT_DAY_BEFORE_HOUR && wakeHour < NEXT_DAY_BEFORE_HOUR) || (wakeHour < sleepHour && wakeHour < NEXT_DAY_BEFORE_HOUR);
  return { sleepStart: `${sleepDate}T${sleepHHMM}:00`, wakeTime: `${isWakeNextDay ? addDays(sleepDate, 1) : sleepDate}T${wakeHHMM}:00` };
}

export function durationHours(entry: Pick<SleepEntry, 'sleepStart' | 'wakeTime'>): number {
  return (new Date(entry.wakeTime).getTime() - new Date(entry.sleepStart).getTime()) / HOUR_MS;
}

export const formatHours = (hours: number): string => {
  const whole = Math.floor(Math.abs(hours));
  return `${whole}h ${pad(Math.round((Math.abs(hours) - whole) * 60))}m`;
};

/** Local wall-clock text (no timezone) for a minute offset from midnight of `dateKey`. */
export function localDateTime(dateKey: string, minutesFromMidnight: number): string {
  const days = Math.floor(minutesFromMidnight / MIN_PER_DAY);
  const inDay = minutesFromMidnight - days * MIN_PER_DAY;
  return `${addDays(dateKey, days)}T${pad(Math.floor(inDay / 60))}:${pad(inDay % 60)}:00`;
}

/** Position along the bar of a bedtime or wake time, or null when it falls outside 22:00–12:00. */
export function hhmmToPos(hhmm: string): number | null {
  const hour = Number(hhmm.slice(0, 2));
  const minute = Number(hhmm.slice(3, 5));
  const pos = ((hour >= 22 ? hour : hour + 24) * 60 + minute - BAR_START_MIN) / BAR_SPAN_MIN;
  return pos < 0 || pos > 1 ? null : pos;
}

/** "HH:MM" of a local wall-clock datetime. */
export const clockOf = (localDateTimeText: string): string => localDateTimeText.slice(11, 16);

/** The weekday of a local YYYY-MM-DD. */
export const weekdayOf = (dateKey: string): string => new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });

const LATE_AFTER_MIN = 30;
const CHART_START_HOUR = 20;

/** Minutes since 20:00, so bedtimes either side of midnight compare in order. */
function sinceEvening(hhmm: string): number {
  const hour = Number(hhmm.slice(0, 2));
  const minute = Number(hhmm.slice(3, 5));
  return hour >= CHART_START_HOUR ? (hour - CHART_START_HOUR) * 60 + minute : (24 - CHART_START_HOUR) * 60 + hour * 60 + minute;
}

/** More than 30 minutes past the target bedtime. */
export const isLateBedtime = (sleepHHMM: string, targetHHMM: string): boolean => sinceEvening(sleepHHMM) - sinceEvening(targetHHMM) > LATE_AFTER_MIN;
