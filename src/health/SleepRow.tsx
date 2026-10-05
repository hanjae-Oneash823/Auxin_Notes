import { useMemo } from 'react';
import { dateKey } from './habitGoals';
import { DAY_COL_PX, GOAL_COL_PX, NAME_COL_PX, NOW_COL_PX, ROW_PX, SLEEP_COLOR, completionColor, heat } from './habitLayout';
import { durationHours } from './sleepTime';
import { useSleepStore } from './sleepStore';

interface SleepRowProps {
  year: number;
  month: number;
  numDays: number;
  today: string;
}

/** The built-in, read-only sleep row: hours per night, tinted by length, against the target. */
export function SleepRow({ year, month, numDays, today }: SleepRowProps) {
  const entries = useSleepStore((state) => state.entries);
  const target = useSleepStore((state) => state.target?.targetDuration ?? null);
  const sleepByDate = useMemo(() => Object.fromEntries(entries.map((entry) => [entry.date, durationHours(entry)])), [entries]);

  const dates = Array.from({ length: numDays }, (_, index) => dateKey(year, month, index + 1)).filter((date) => date <= today);
  const metCount = target === null ? 0 : dates.filter((date) => (sleepByDate[date] ?? 0) >= target).length;
  const longest = Math.max(0, ...dates.map((date) => sleepByDate[date] ?? 0));
  const ratio = dates.length > 0 ? metCount / dates.length : 0;

  return (
    <div className="flex items-center border-b" style={{ height: ROW_PX, borderColor: 'var(--border-subtle)' }}>
      <div className="sticky left-0 z-10 flex h-full shrink-0 items-center gap-2 bg-bg pr-3" style={{ width: NAME_COL_PX }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SLEEP_COLOR }} />
        <span className="text-fg-prominent">sleep</span>
        <span className="text-fg-faint" style={{ fontSize: '0.7rem' }}>auto</span>
      </div>
      {Array.from({ length: numDays }, (_, index) => {
        const date = dateKey(year, month, index + 1);
        const hours = sleepByDate[date];
        return (
          <div
            key={date}
            className="flex h-full shrink-0 items-center justify-center text-fg-prominent"
            style={{
              width: DAY_COL_PX,
              fontSize: '0.68rem',
              background: hours === undefined ? (date === today ? 'var(--border-subtle)' : 'transparent') : heat(SLEEP_COLOR, longest > 0 ? hours / longest : 0),
            }}
          >
            {hours === undefined ? '' : hours.toFixed(1)}
          </div>
        );
      })}
      <div className="flex h-full shrink-0 items-center justify-center border-l text-fg-muted" style={{ width: GOAL_COL_PX, borderColor: 'var(--border-subtle)', fontSize: '0.78rem' }}>
        {target === null ? '—' : `≥${target}h`}
      </div>
      <div className="flex h-full shrink-0 items-center justify-center gap-1 border-l" style={{ width: NOW_COL_PX, borderColor: 'var(--border-subtle)', fontSize: '0.78rem' }}>
        <span style={{ color: ratio > 0 ? completionColor(ratio) : 'var(--fg-faint)' }}>{metCount}d</span>
      </div>
    </div>
  );
}
