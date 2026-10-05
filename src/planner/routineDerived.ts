import type { RoutineRuleInput } from '../db/queries/planner/types';
import { addMinutesToTime, offsetDateKey, todayKey } from './nodeDerived';

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const HEATMAP_DAYS = 21;
const DEFAULT_END_COUNT = 52;

/** A fresh recurring rule: weekly on today's weekday, ending after a year of occurrences. */
export function newRuleInput(): RoutineRuleInput {
  const today = todayKey();
  return {
    freq: 'weekly', repeatInterval: 1, days: [new Date(`${today}T12:00:00`).getDay()], startDate: today,
    endMode: 'count', endCount: DEFAULT_END_COUNT, endDate: null, startTime: null, durationMinutes: null, exceptions: [],
  };
}

export function manualRuleInput(startDate: string, startTime: string | null, durationMinutes: number | null): RoutineRuleInput {
  return {
    freq: 'manual', repeatInterval: 1, days: [], startDate, endMode: 'count', endCount: 1, endDate: null,
    startTime, durationMinutes, exceptions: [],
  };
}

export function timeRange(rule: Pick<RoutineRuleInput, 'startTime' | 'durationMinutes'> | undefined): string {
  if (!rule?.startTime) return '';
  return rule.durationMinutes ? `${rule.startTime}–${addMinutesToTime(rule.startTime, rule.durationMinutes)}` : rule.startTime;
}

/** Port of Mycelium's recurrenceLabel for one rule. */
export function recurrenceLabel(rule: RoutineRuleInput | undefined): string {
  if (!rule || rule.freq === 'manual') return 'manual';
  const n = rule.repeatInterval;
  if (rule.freq === 'daily') return n === 1 ? 'every day' : `every ${n} days`;
  if (rule.freq === 'monthly') return n === 1 ? 'every month' : `every ${n} months`;
  if (rule.days.length > 0) return `every ${rule.days.map((day) => DAY_SHORT[day]).join(', ')}`;
  return n === 1 ? 'every week' : `every ${n} weeks`;
}

export function ruleLabel(rule: RoutineRuleInput): string {
  if (rule.freq === 'manual') return `manual · ${rule.startDate}${rule.startTime ? ` ${timeRange(rule)}` : ''}`;
  const end = rule.endMode === 'date' && rule.endDate ? `until ${rule.endDate}` : `${rule.endCount ?? '?'} times`;
  const skipped = rule.exceptions.length > 0 ? ` · ${rule.exceptions.length} exception${rule.exceptions.length > 1 ? 's' : ''}` : '';
  return `${recurrenceLabel(rule)}${rule.startTime ? ` ${timeRange(rule)}` : ''} · ${end}${skipped}`;
}

export interface HeatCell { date: string; state: 'done' | 'missed' | 'none' }

/** The last HEATMAP_DAYS days: done = a completed occurrence, missed = scheduled but not completed, none = nothing scheduled. */
export function heatCells(dayMap: ReadonlyMap<string, boolean>): HeatCell[] {
  return Array.from({ length: HEATMAP_DAYS }, (_, index) => {
    const date = offsetDateKey(-(HEATMAP_DAYS - 1 - index));
    const isCompleted = dayMap.get(date);
    return { date, state: isCompleted === undefined ? 'none' : isCompleted ? 'done' : 'missed' };
  });
}
