// Pure math for the weekly timeline popup: which days a block touches and where it sits in each.

const DAYS_IN_WEEK = 7;
const HOURS_IN_DAY = 24;

/** The 8 local midnights that bound a Monday-first week: Monday through the next Monday. `weekOffset` 0 is the week containing `nowMs`. */
export function weekDayStarts(weekOffset: number, nowMs: number): number[] {
  const today = new Date(nowMs);
  const daysSinceMonday = (today.getDay() + 6) % DAYS_IN_WEEK;
  const firstDay = today.getDate() - daysSinceMonday + weekOffset * DAYS_IN_WEEK;
  // Date() per day rather than adding 24h, so a daylight-saving week still starts each day at midnight.
  return Array.from({ length: DAYS_IN_WEEK + 1 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), firstDay + i).getTime());
}

/** The part of a block inside one day column, as fractions (0–1) of the column's height. */
export interface DayPiece {
  dayIndex: number;
  topFraction: number;
  heightFraction: number;
}

/** Cuts [startMs, endMs] along the week's midnights. A block that crosses midnight yields one piece per day it touches. */
export function dayPieces(startMs: number, endMs: number, dayStarts: readonly number[]): DayPiece[] {
  const pieces: DayPiece[] = [];
  for (let dayIndex = 0; dayIndex < dayStarts.length - 1; dayIndex += 1) {
    const dayStart = dayStarts[dayIndex];
    const dayEnd = dayStarts[dayIndex + 1];
    const from = Math.max(startMs, dayStart);
    const to = Math.min(endMs, dayEnd);
    if (to <= from) continue;
    const dayLength = dayEnd - dayStart;
    pieces.push({ dayIndex, topFraction: (from - dayStart) / dayLength, heightFraction: (to - from) / dayLength });
  }
  return pieces;
}

/** Fraction of the day column at which `ms` falls, or null when it isn't in this day. */
export function dayFraction(ms: number, dayStart: number, dayEnd: number): number | null {
  return ms >= dayStart && ms < dayEnd ? (ms - dayStart) / (dayEnd - dayStart) : null;
}

/** Mycelium's load-strip yellows: one shade per planned hour, darker the busier the day. */
const LOAD_SHADES = ['#fff9c4', '#fde968', '#f5c842', '#e6a817', '#c47f00', '#a06000'] as const;

/** Shade for a day with `plannedMinutes` of timed nodes; null for a free day. */
export function loadShade(plannedMinutes: number): string | null {
  if (plannedMinutes <= 0) return null;
  return LOAD_SHADES[Math.min(Math.floor(plannedMinutes / 60), LOAD_SHADES.length - 1)];
}

export const HOUR_LABELS: readonly number[] = Array.from({ length: HOURS_IN_DAY + 1 }, (_, hour) => hour);
