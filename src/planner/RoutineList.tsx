import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Arc, Project, Routine } from '../db/queries/planner/types';
import { offsetDateKey, todayKey } from './nodeDerived';
import { addDays, weekStartOf } from './routineWeek';
import { ArcIcon, ProjectIcon } from './plannerIcons';
import { PROJECT_COLOR } from './quickAddMentions';

/** The next-date column has one width on every card, so the dates line up. */
const NEXT_COLUMN_REM = 6.5;
const NO_ARC_KEY = '__none__';
const NO_ARC_COLOR = 'var(--fg-muted)';
const DAYS_IN_WEEK = 7;
/** The expanded card's grid shows this many weeks after the current one; the rest of the width is history. */
const GRID_WEEKS_AHEAD = 3;
const CELL_PX = 11;
const CELL_GAP_PX = 3;
/** Row labels, Monday first like the grid. */
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface Group { key: string; label: string; color: string; icon?: ReactNode; routines: readonly Routine[] }

interface RoutineListProps {
  routines: readonly Routine[];
  arcs: readonly Arc[];
  projects: readonly Project[];
  /** Routines switched off on the calendar. */
  hiddenIds: ReadonlySet<string>;
  /** The routine open in the editor. */
  selectedId: string | null;
  /** routine id → all-time occurrences done, of every occurrence generated (past and upcoming). */
  progress: ReadonlyMap<string, { done: number; total: number }>;
  /** routine id → date (YYYY-MM-DD) of its next unfinished occurrence. */
  nextDates: ReadonlyMap<string, string>;
  /** routine id → date → whether that day's occurrence is done. */
  history: ReadonlyMap<string, ReadonlyMap<string, boolean>>;
  /** Opens the routine's editor, or closes it when it is already open. */
  onOpen: (routine: Routine) => void;
  onToggleRoutine: (id: string) => void;
  /** Show or hide every routine in a group at once. */
  onToggleGroup: (routineIds: readonly string[]) => void;
  onContextMenu: (routine: Routine, x: number, y: number) => void;
}

function nextLabel(date: string | undefined): string {
  if (!date) return '';
  if (date === todayKey()) return 'today';
  if (date === offsetDateKey(1)) return 'tomorrow';
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** A GitHub-style grid of a routine's days, one column per week: filled = done, dim = scheduled, empty = none. */
function HistoryGrid({ days, color }: { days: ReadonlyMap<string, boolean> | undefined; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [weeks, setWeeks] = useState(GRID_WEEKS_AHEAD + 1);
  // As many week columns as fit the card, so the grid spans its full width.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => setWeeks(Math.max(GRID_WEEKS_AHEAD + 1, Math.floor((element.clientWidth + CELL_GAP_PX) / (CELL_PX + CELL_GAP_PX))));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** The hovered square. Native `title` tooltips don't show in the Tauri webview, so the tooltip is drawn here. */
  const [hover, setHover] = useState<{ label: string; x: number; y: number } | null>(null);
  const today = todayKey();
  const start = addDays(weekStartOf(today), -(weeks - 1 - GRID_WEEKS_AHEAD) * DAYS_IN_WEEK);
  const cells = Array.from({ length: weeks * DAYS_IN_WEEK }, (_, index) => addDays(start, index));
  return (
    <>
    <div className="flex gap-2 py-2">
    <div
      aria-hidden
      className="grid shrink-0 text-fg-faint"
      style={{ gap: CELL_GAP_PX, gridTemplateRows: `repeat(${DAYS_IN_WEEK}, ${CELL_PX}px)`, fontSize: '0.6rem', lineHeight: `${CELL_PX}px` }}
    >
      {WEEKDAY_LETTERS.map((letter, index) => <span key={index}>{letter}</span>)}
    </div>
    <div
      ref={ref}
      className="grid min-w-0 flex-1 justify-between"
      style={{ gap: CELL_GAP_PX, gridTemplateRows: `repeat(${DAYS_IN_WEEK}, ${CELL_PX}px)`, gridAutoFlow: 'column', gridAutoColumns: `${CELL_PX}px` }}
    >
      {cells.map((date) => {
        const isDone = days?.get(date);
        return (
          <span
            key={date}
            onMouseEnter={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const label = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
              setHover({ label: `${label}${isDone === undefined ? '' : isDone ? ' · done' : ' · not done'}`, x: rect.left + rect.width / 2, y: rect.top });
            }}
            onMouseLeave={() => setHover(null)}
            className="rounded-[2px] bg-border-subtle"
            style={{
              background: isDone === undefined ? undefined : color,
              opacity: isDone === false ? 0.3 : 1,
              outline: date === today ? '1px solid var(--fg-muted)' : undefined,
            }}
          />
        );
      })}
    </div>
    </div>
    {hover && (
      <div
        role="tooltip"
        className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-tab border border-border-strong bg-bg px-2 py-1 text-fg-prominent"
        style={{ left: hover.x, top: hover.y - 6, fontSize: '0.72rem' }}
      >
        {hover.label}
      </div>
    )}
    </>
  );
}

/** Routines grouped by arc. Clicking one opens its editor over the calendar; the eye shows or hides it there. */
export function RoutineList({ routines, arcs, projects, hiddenIds, selectedId, progress, nextDates, history, onOpen, onToggleRoutine, onToggleGroup, onContextMenu }: RoutineListProps) {
  const groups: Group[] = [
    ...arcs.filter((arc) => arc.status === 'active').map((arc) => ({ key: arc.id, label: arc.name, color: arc.colorHex, icon: <ArcIcon arc={arc} size={16} />, routines: routines.filter((routine) => routine.arcId === arc.id) })),
    { key: NO_ARC_KEY, label: 'no arc', color: NO_ARC_COLOR, routines: routines.filter((routine) => !routine.arcId) },
  ].filter((group) => group.routines.length > 0);

  if (groups.length === 0) return <p className="text-fg-faint">No routines yet. Create one with “New routine”.</p>;

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => {
        const ids = group.routines.map((routine) => routine.id);
        const isAllHidden = ids.every((id) => hiddenIds.has(id));
        return (
          <section key={group.key} className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => onToggleGroup(ids)}
              title={isAllHidden ? 'show all on the calendar' : 'hide all from the calendar'}
              className="flex items-center gap-2 px-1 text-left transition-opacity duration-panel ease-panel"
              style={{ opacity: isAllHidden ? 0.45 : 1 }}
            >
              {group.icon}
              <h3 className="min-w-0 truncate font-semibold" style={{ fontSize: '1.05rem', color: group.color }}>{group.label}</h3>
              <span className="text-fg-faint tabular-nums" style={{ fontSize: '0.8rem' }}>({group.routines.length})</span>
            </button>

            {group.routines.map((routine) => {
              const isHidden = hiddenIds.has(routine.id);
              const isSelected = routine.id === selectedId;
              const project = projects.find((candidate) => candidate.id === routine.projectId);
              const { done, total } = progress.get(routine.id) ?? { done: 0, total: 0 };
              return (
                <div
                  key={routine.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(routine)}
                  onKeyDown={(event) => event.key === 'Enter' && onOpen(routine)}
                  onContextMenu={(event) => { event.preventDefault(); onContextMenu(routine, event.clientX, event.clientY); }}
                  className={`group flex cursor-pointer flex-wrap items-center gap-x-3 rounded-tab border px-3 py-2 outline-none transition-colors duration-panel ease-panel hover:bg-border-subtle focus-visible:border-border-strong ${
                    isSelected ? 'border-border-strong bg-border-subtle' : 'border-border-subtle bg-[var(--color-dashboard-card-bg)]'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1" style={{ opacity: isHidden ? 0.45 : 1 }}>
                    <span className={`truncate ${routine.importanceLevel === 1 ? 'text-accent-warning' : 'text-fg-prominent'}`}>
                      {routine.importanceLevel === 1 && '★ '}{routine.title}
                    </span>
                    {project && <span className="flex min-w-0 items-center gap-1" style={{ fontSize: '0.68rem', color: PROJECT_COLOR }}><ProjectIcon project={project} size={10} className="shrink-0" /><span className="truncate">{project.name}</span></span>}
                  </div>
                  <span className="shrink-0 text-right text-fg-faint tabular-nums" style={{ width: NEXT_COLUMN_REM + 'rem', fontSize: '0.72rem', opacity: isHidden ? 0.45 : 1 }}>{nextLabel(nextDates.get(routine.id))}</span>
                  <button
                    type="button"
                    aria-label={isHidden ? 'show on calendar' : 'hide from calendar'}
                    title={isHidden ? 'show on calendar' : 'hide from calendar'}
                    onClick={(event) => { event.stopPropagation(); onToggleRoutine(routine.id); }}
                    className={`shrink-0 p-0.5 text-fg-faint transition-all duration-panel ease-panel hover:text-fg-prominent focus-visible:opacity-100 group-hover:opacity-100 ${isHidden ? 'opacity-100' : 'opacity-0'}`}
                  >
                    {isHidden ? <EyeSlash size={14} /> : <Eye size={14} />}
                  </button>
                  <span className="mt-1.5 flex basis-full items-center gap-2" style={{ opacity: isHidden ? 0.45 : 1 }}>
                    <span
                      role="progressbar"
                      aria-label={`${routine.title} progress, all time`}
                      aria-valuemin={0}
                      aria-valuemax={total}
                      aria-valuenow={done}
                      className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-border-subtle"
                    >
                      <span className="block h-full transition-[width] duration-panel ease-panel" style={{ width: total === 0 ? 0 : `${(done / total) * 100}%`, background: group.color }} />
                    </span>
                    <span className="w-12 shrink-0 text-right text-fg-faint tabular-nums" style={{ fontSize: '0.72rem' }}>{total === 0 ? '–' : `${done}/${total}`}</span>
                  </span>
                  <div
                    aria-hidden={!isSelected}
                    className="grid basis-full transition-[grid-template-rows,opacity] duration-panel ease-panel"
                    style={{ gridTemplateRows: isSelected ? '1fr' : '0fr', opacity: isSelected ? 1 : 0 }}
                  >
                    <div className="min-h-0 overflow-hidden"><HistoryGrid days={history.get(routine.id)} color={group.color} /></div>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
