import { useMemo } from 'react';
import { dateKey } from './habitGoals';
import { DAY_COL_PX, GOAL_COL_PX, NAME_COL_PX, NOW_COL_PX } from './habitLayout';
import { HabitRow } from './HabitRow';
import { SleepRow } from './SleepRow';
import { useHabitStore } from './habitStore';
import type { Habit } from '../db/queries/health/types';

interface HabitGridProps {
  year: number;
  month: number;
  today: string;
  onEdit: (habit: Habit) => void;
}

const weekdayInitials = (year: number, month: number, day: number): string =>
  new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);

const HEADER_BORDER = '1px solid var(--border-strong)';

/** The month at a glance: a header of days, the sleep row, then one row per habit. */
export function HabitGrid({ year, month, today, onEdit }: HabitGridProps) {
  const habits = useHabitStore((state) => state.habits);
  const logs = useHabitStore((state) => state.logs);
  const numDays = new Date(year, month, 0).getDate();

  const logsByHabit = useMemo(() => {
    const byHabit = new Map<string, Map<string, number | null>>();
    for (const log of logs) byHabit.set(log.habitId, (byHabit.get(log.habitId) ?? new Map()).set(log.date, log.value));
    return byHabit;
  }, [logs]);

  return (
    <div style={{ width: NAME_COL_PX + numDays * DAY_COL_PX + GOAL_COL_PX + NOW_COL_PX }}>
      <div className="flex" style={{ borderBottom: HEADER_BORDER }}>
        <div className="sticky left-0 z-10 shrink-0 bg-bg" style={{ width: NAME_COL_PX }} />
        {Array.from({ length: numDays }, (_, index) => {
          const day = index + 1;
          const date = dateKey(year, month, day);
          const isToday = date === today;
          return (
            <div key={day} className="flex shrink-0 flex-col items-center pb-1.5" style={{ width: DAY_COL_PX }}>
              <div
                className={`flex w-6 flex-col items-center rounded-tab py-0.5 leading-tight ${isToday ? 'text-black' : date > today ? 'text-fg-faint' : 'text-fg-muted'}`}
                style={{ background: isToday ? 'var(--accent-link)' : 'transparent' }}
              >
                <span style={{ fontSize: '0.62rem' }}>{weekdayInitials(year, month, day)}</span>
                <span style={{ fontSize: '0.82rem' }}>{day}</span>
              </div>
            </div>
          );
        })}
        <div className="flex shrink-0 items-end justify-center pb-1.5 text-fg-faint" style={{ width: GOAL_COL_PX, fontSize: '0.68rem', letterSpacing: 1 }}>GOAL</div>
        <div className="flex shrink-0 items-end justify-center pb-1.5 text-fg-faint" style={{ width: NOW_COL_PX, fontSize: '0.68rem', letterSpacing: 1 }}>NOW</div>
      </div>

      <SleepRow year={year} month={month} numDays={numDays} today={today} />
      {habits.map((habit) => (
        <HabitRow key={habit.id} habit={habit} logs={logsByHabit.get(habit.id) ?? new Map()} year={year} month={month} numDays={numDays} today={today} onEdit={() => onEdit(habit)} />
      ))}
      {habits.length === 0 && <p className="pt-6 text-fg-faint">No habits yet — click “New habit” to add one.</p>}
    </div>
  );
}
