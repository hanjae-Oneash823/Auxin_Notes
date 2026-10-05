import { useState } from 'react';
import { evaluateGoal, dateKey } from './habitGoals';
import { DAY_COL_PX, GOAL_COL_PX, NAME_COL_PX, NOW_COL_PX, ROW_PX, completionColor } from './habitLayout';
import { NumericCell } from './NumericCell';
import type { Habit } from '../db/queries/health/types';
import { useHabitStore } from './habitStore';

interface HabitRowProps {
  habit: Habit;
  /** This habit's logs for the viewed month's range: date → value. */
  logs: ReadonlyMap<string, number | null>;
  year: number;
  month: number;
  numDays: number;
  today: string;
  onEdit: () => void;
}

const CELL_BORDER = 'var(--border-subtle)';

/** One habit: name (edit / delete on hover), a cell per day, its goal and how it stands. */
export function HabitRow({ habit, logs, year, month, numDays, today, onEdit }: HabitRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const toggleBoolean = useHabitStore((state) => state.toggleBoolean);
  const setNumeric = useHabitStore((state) => state.setNumeric);
  const archiveHabit = useHabitStore((state) => state.archiveHabit);

  const goal = evaluateGoal(habit, logs, year, month, today);
  const monthValues = Array.from(logs.entries()).filter(([date]) => date.startsWith(dateKey(year, month, 1).slice(0, 8))).map(([, value]) => value ?? 0);
  const best = Math.max(0, ...monthValues);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex items-center border-b transition-colors duration-panel ease-panel hover:bg-border-subtle"
      style={{ height: ROW_PX, borderColor: CELL_BORDER }}
    >
      <div className="sticky left-0 z-10 flex h-full shrink-0 items-center gap-2 bg-bg pr-3" style={{ width: NAME_COL_PX }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: habit.color }} />
        <span className="min-w-0 flex-1 truncate text-fg-prominent" title={habit.name}>{habit.name}</span>
        {isHovered && (
          <span className="flex shrink-0 gap-2" style={{ fontSize: '0.72rem' }}>
            <button type="button" onClick={onEdit} className="text-fg-faint hover:text-fg-prominent">edit</button>
            <button type="button" onClick={() => archiveHabit(habit.id)} className="text-fg-faint hover:text-accent-link-broken">del</button>
          </span>
        )}
      </div>

      {Array.from({ length: numDays }, (_, index) => {
        const date = dateKey(year, month, index + 1);
        const isFuture = date > today;
        const isToday = date === today;
        const cellStyle = { width: DAY_COL_PX, background: isToday ? 'var(--border-subtle)' : 'transparent' };
        if (habit.valueType === 'numeric') {
          const value = logs.get(date) ?? null;
          return (
            <div key={date} className="h-full shrink-0" style={cellStyle}>
              <NumericCell value={value} color={habit.color} ratio={best > 0 && value !== null ? value / best : 0} isDisabled={isFuture} onChange={(next) => setNumeric(habit.id, date, next)} />
            </div>
          );
        }
        const isDone = logs.has(date);
        return (
          <button
            key={date}
            type="button"
            disabled={isFuture}
            aria-label={`${habit.name} ${date}`}
            aria-pressed={isDone}
            onClick={() => toggleBoolean(habit.id, date)}
            className="flex h-full shrink-0 items-center justify-center disabled:cursor-default"
            style={cellStyle}
          >
            <span
              className="h-3.5 w-3.5 rounded-[3px] border"
              style={{ background: isDone ? habit.color : 'transparent', borderColor: isDone ? habit.color : isFuture ? CELL_BORDER : 'var(--fg-faint)' }}
            />
          </button>
        );
      })}

      <div className="flex h-full shrink-0 items-center justify-center border-l text-fg-muted" style={{ width: GOAL_COL_PX, borderColor: CELL_BORDER, fontSize: '0.78rem' }}>
        {goal.label}
      </div>
      <div className="flex h-full shrink-0 items-center justify-center gap-1 border-l" style={{ width: NOW_COL_PX, borderColor: CELL_BORDER, fontSize: '0.78rem' }}>
        {goal.progress && <span style={{ color: goal.ratio > 0 ? completionColor(goal.ratio) : 'var(--fg-faint)' }}>{goal.progress}</span>}
        {goal.isAchieved === true && <span style={{ color: completionColor(1) }}>✓</span>}
      </div>
    </div>
  );
}
