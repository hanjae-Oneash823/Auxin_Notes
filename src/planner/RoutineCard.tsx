import { useState } from 'react';
import type { Arc, Project, Routine } from '../db/queries/planner/types';
import { offsetDateKey, todayKey } from './nodeDerived';
import { DAY_SHORT, heatCells, recurrenceLabel, timeRange, type HeatCell } from './routineDerived';

const TASK_COLOR = '#00c4a7';
const EVENT_COLOR = '#c084fc';
const MISSED_CELL = 'rgba(239,68,68,0.4)';

interface RoutineCardProps {
  routine: Routine;
  arc: Arc | undefined;
  project: Project | undefined;
  /** Earliest pending occurrence from today on, if any. */
  nextDate: string | null;
  /** date → completed? for the routine's occurrences in the heatmap window. */
  dayMap: ReadonlyMap<string, boolean>;
  doneCount: number;
  pendingCount: number;
  onEdit: () => void;
  onDelete: () => void;
}

function statusOf(nextDate: string | null): { label: string; isToday: boolean } {
  if (!nextDate) return { label: '', isToday: false };
  if (nextDate === todayKey()) return { label: 'TODAY', isToday: true };
  if (nextDate === offsetDateKey(1)) return { label: 'TMRW', isToday: false };
  return { label: DAY_SHORT[new Date(`${nextDate}T12:00:00`).getDay()].toUpperCase(), isToday: false };
}

function Cell({ cell, color }: { cell: HeatCell; color: string }) {
  const background = cell.state === 'done' ? color : cell.state === 'missed' ? MISSED_CELL : 'var(--border-subtle, rgba(255,255,255,0.06))';
  return (
    <span
      title={cell.date}
      className="h-3.5 w-1.5 shrink-0 rounded-[1px]"
      style={{ background, outline: cell.date === todayKey() ? '1px solid rgba(255,255,255,0.4)' : 'none', outlineOffset: -1 }}
    />
  );
}

/** Mycelium's RoutineCard: prompt + title + next-occurrence tag, project and
 *  schedule meta lines, and a 21-day history strip with a done/total count. */
export function RoutineCard({ routine, arc, project, nextDate, dayMap, doneCount, pendingCount, onEdit, onDelete }: RoutineCardProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const { label, isToday } = statusOf(nextDate);
  const rule = routine.rules[0];
  const info = [recurrenceLabel(rule), timeRange(rule)].filter(Boolean).join(' · ');
  const cellColor = routine.nodeType === 'event' ? EVENT_COLOR : TASK_COLOR;
  const isImportant = routine.importanceLevel === 1;

  return (
    <div
      onMouseLeave={() => setIsConfirming(false)}
      className="group flex flex-col gap-1.5 rounded-tab border border-border-subtle px-3 py-2.5 transition-colors duration-panel ease-panel hover:border-border-strong"
      style={isToday ? { background: 'rgba(0,196,167,0.05)' } : undefined}
    >
      <div className="flex items-start gap-2">
        <span className={isToday ? 'text-[#00c4a7]' : 'text-fg-faint'}>&gt;</span>
        <span className={`min-w-0 flex-1 truncate ${isImportant ? 'text-accent-warning' : 'text-fg-prominent'}`}>
          {isImportant ? '★ ' : ''}{routine.title}
        </span>
        {label && <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.68rem', letterSpacing: 1, color: isToday ? TASK_COLOR : undefined }}>[{label}]</span>}
        <span className="flex shrink-0 gap-2 opacity-0 transition-opacity duration-panel group-hover:opacity-100" style={{ fontSize: '0.72rem' }}>
          <button type="button" onClick={onEdit} className="text-fg-muted hover:text-fg-prominent">[edit]</button>
          <button
            type="button"
            onClick={() => (isConfirming ? onDelete() : setIsConfirming(true))}
            className={isConfirming ? 'text-accent-link-broken' : 'text-fg-faint hover:text-fg-prominent'}
          >
            {isConfirming ? '[confirm]' : '[del]'}
          </button>
        </span>
      </div>

      <div className="flex flex-col gap-0.5 text-fg-faint" style={{ fontSize: '0.74rem' }}>
        {project && <span className="truncate" style={{ color: arc ? `${arc.colorHex}cc` : undefined }}># {project.name}</span>}
        <span className="truncate">// {info}</span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-1 flex-wrap gap-0.5" title="last 21 days">
          {heatCells(dayMap).map((cell) => <Cell key={cell.date} cell={cell} color={cellColor} />)}
        </span>
        <span className="shrink-0 text-fg-muted">{doneCount}/{doneCount + pendingCount}</span>
      </div>
    </div>
  );
}
