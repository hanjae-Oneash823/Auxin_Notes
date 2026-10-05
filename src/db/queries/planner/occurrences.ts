import type { RoutineRule } from './types.ts';
import { localDateKey } from './util.ts';

// Exact port of Mycelium's recurrence.ts (generateOccurrenceDates) and
// routineDb.ts (generateRuleDates) so migrated routines keep producing the
// same dates. Quirks kept on purpose: with no end date a rule only looks one
// year past its start, at most 500 occurrences are produced, and monthly rules
// advance with Date.setMonth (a day-31 start overflows into the next month).

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;
  /** Weekly only, 0 = Sun … 6 = Sat. */
  days?: number[];
  /** YYYY-MM-DD, inclusive. */
  until?: string;
}

const MAX_OCCURRENCES = 500;

export function generateOccurrenceDates(rule: RecurrenceRule, startDateStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${startDateStr}T00:00:00`);

  const maxDate = new Date(start);
  maxDate.setFullYear(maxDate.getFullYear() + 1);
  const until = rule.until ? new Date(`${rule.until}T00:00:00`) : maxDate;
  const end = until < maxDate ? until : maxDate;

  if (rule.freq === 'daily') {
    const cursor = new Date(start);
    while (cursor <= end && dates.length < MAX_OCCURRENCES) {
      dates.push(localDateKey(cursor));
      cursor.setDate(cursor.getDate() + rule.interval);
    }
  } else if (rule.freq === 'weekly') {
    if (rule.days && rule.days.length > 0) {
      for (let week = 0; dates.length < MAX_OCCURRENCES; week += rule.interval) {
        const weekBase = new Date(start);
        weekBase.setDate(start.getDate() + week * 7);
        if (weekBase > end) break;
        for (let offset = 0; offset < 7 && dates.length < MAX_OCCURRENCES; offset++) {
          const candidate = new Date(weekBase);
          candidate.setDate(weekBase.getDate() + offset);
          if (candidate >= start && candidate <= end && rule.days.includes(candidate.getDay())) {
            dates.push(localDateKey(candidate));
          }
        }
      }
    } else {
      const cursor = new Date(start);
      while (cursor <= end && dates.length < MAX_OCCURRENCES) {
        dates.push(localDateKey(cursor));
        cursor.setDate(cursor.getDate() + rule.interval * 7);
      }
    }
  } else if (rule.freq === 'monthly') {
    const cursor = new Date(start);
    while (cursor <= end && dates.length < MAX_OCCURRENCES) {
      dates.push(localDateKey(cursor));
      cursor.setMonth(cursor.getMonth() + rule.interval);
    }
  }

  return [...new Set(dates)].sort();
}

/** Dates one stored rule generates: "after N times" counts before exceptions are removed. */
export function ruleOccurrenceDates(rule: Omit<RoutineRule, 'id' | 'routineId' | 'sortOrder'>): string[] {
  if (rule.freq === 'manual') return [rule.startDate];
  const dates = generateOccurrenceDates(
    {
      freq: rule.freq,
      interval: rule.repeatInterval,
      days: rule.days.length > 0 ? rule.days : undefined,
      until: rule.endMode === 'date' ? rule.endDate ?? undefined : undefined,
    },
    rule.startDate,
  );
  const counted = rule.endMode === 'count' && rule.endCount ? dates.slice(0, rule.endCount) : dates;
  const skipped = new Set(rule.exceptions);
  return skipped.size > 0 ? counted.filter((date) => !skipped.has(date)) : counted;
}
