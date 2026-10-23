import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { WEEK_TIMELINE_WIDTH_PX } from '../clock/WeekFrame';
import { ContextMenu, type ContextMenuItem } from '../layout/ContextMenu';
import type { Routine } from '../db/queries/planner/types';
import { ConfirmModal } from './ConfirmModal';
import { RoutineForm } from './RoutineForm';
import { RoutineList } from './RoutineList';
import { RoutineWeekCalendar } from './RoutineWeekCalendar';
import { plannedDateOf, todayKey } from './nodeDerived';
import { usePlannerStore } from './plannerStore';
import { addDays, occurrenceBlocks, timeOfMinutes, weekDatesAt, type WeekBlock } from './routineWeek';

const DAYS_IN_WEEK = 7;
/** What the calendar leaves free below it: the page's bottom padding and the status bar. */
const BOTTOM_GAP_PX = 60;
const MIN_CALENDAR_PX = 560;
/** The tab slides in over about this long; its position settles then, so measure again after it. */
const SETTLE_MS = 300;
/** How long the editor's exit animation runs (see .routine-editor-out in global.css). */
const EDITOR_EXIT_MS = 180;
const PAUSE_WEEKS = [1, 2, 4] as const;

const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

interface OpenMenu { x: number; y: number; items: ContextMenuItem[] }

/** The Routines tab: the routine list on the left, a thin week calendar on the right. Opening a routine
 *  puts its editor over the calendar. Single occurrences can be skipped, moved or paused from the calendar
 *  without touching the routine's rule. */
export function RoutinesView() {
  const { routines, arcs, projects, nodes, setCompleted, saveRoutine, removeRoutine, archiveRoutine, skipRoutine, moveOccurrence } = usePlannerStore();
  const [weekOffset, setWeekOffset] = useState(0);
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  /** The routine open in the editor, or `null` for a new one; `undefined` when the editor is closed. */
  const [editing, setEditing] = useState<Routine | null | undefined>(undefined);
  /** The editor's content, kept after it closes so it can animate out. */
  const [lingering, setLingering] = useState<Routine | null | undefined>(undefined);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const [column, setColumn] = useState({ height: MIN_CALENDAR_PX, stickyTop: 0 });

  // The calendar column runs from where it starts to the bottom of the window, so the whole week (and the editor over it) is always in view.
  // It is also sticky just under the planner's pinned tab bar, so scrolling the page (a long routine list) never carries it away.
  useLayoutEffect(() => {
    const fit = () => {
      const element = columnRef.current;
      if (!element) return;
      const header = element.closest<HTMLElement>('.overflow-y-auto')?.querySelector<HTMLElement>(':scope > .sticky');
      const stickyTop = header?.offsetHeight ?? 0;
      const top = Math.max(element.getBoundingClientRect().top, stickyTop);
      setColumn({ height: Math.max(MIN_CALENDAR_PX, window.innerHeight - top - BOTTOM_GAP_PX), stickyTop });
    };
    fit();
    const settle = window.setTimeout(fit, SETTLE_MS);
    window.addEventListener('resize', fit);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('resize', fit);
    };
  }, []);
  useEffect(() => {
    if (editing !== undefined) { setLingering(editing); return; }
    const timer = window.setTimeout(() => setLingering(undefined), EDITOR_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [editing]);
  const editorContent = editing !== undefined ? editing : lingering;
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Routine | null>(null);

  // Routines under a finished or archived arc / project are hidden, like Mycelium.
  const archivedRoutines = routines.filter((routine) => routine.isArchived);
  const liveRoutines = routines.filter((routine) =>
    !routine.isArchived
    && (arcs.find((arc) => arc.id === routine.arcId)?.status ?? 'active') === 'active'
    && (projects.find((project) => project.id === routine.projectId)?.status ?? 'active') === 'active');

  const dates = weekDatesAt(weekOffset, todayKey());
  const blocks = useMemo(() => {
    const shown = liveRoutines.filter((routine) => !hiddenIds.has(routine.id));
    const shownIds = new Set(shown.map((routine) => routine.id));
    const occurrences = occurrenceBlocks(nodes, arcs).filter((block) => shownIds.has(block.routineId));
    return occurrences.filter((block) => dates.includes(block.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, arcs, routines, projects, hiddenIds, weekOffset]);

  /** All-time completion per routine: occurrences done, of every occurrence generated, past and upcoming. */
  const progress = useMemo(() => {
    const counts = new Map<string, { done: number; total: number }>();
    for (const node of nodes) {
      const date = plannedDateOf(node);
      if (!node.isRoutine || !node.routineId || !date) continue;
      const current = counts.get(node.routineId) ?? { done: 0, total: 0 };
      counts.set(node.routineId, { done: current.done + (node.isCompleted ? 1 : 0), total: current.total + 1 });
    }
    return counts;
  }, [nodes]);

  /** routine id → date → whether that day's occurrence is done, for the expanded card's grid. */
  const history = useMemo(() => {
    const byRoutine = new Map<string, Map<string, boolean>>();
    for (const node of nodes) {
      const date = plannedDateOf(node);
      if (!node.isRoutine || !node.routineId || !date) continue;
      const days = byRoutine.get(node.routineId) ?? new Map<string, boolean>();
      days.set(date, (days.get(date) ?? false) || node.isCompleted);
      byRoutine.set(node.routineId, days);
    }
    return byRoutine;
  }, [nodes]);

  /** The next unfinished occurrence of each routine, from today on. */
  const nextDates = useMemo(() => {
    const today = todayKey();
    const next = new Map<string, string>();
    for (const node of nodes) {
      const date = plannedDateOf(node);
      if (!node.isRoutine || !node.routineId || node.isCompleted || !date || date < today) continue;
      const current = next.get(node.routineId);
      if (current === undefined || date < current) next.set(node.routineId, date);
    }
    return next;
  }, [nodes]);

  const toggleHidden = (ids: readonly string[]) => setHiddenIds((current) => {
    const next = new Set(current);
    const isAllHidden = ids.every((id) => next.has(id));
    for (const id of ids) {
      if (isAllHidden) next.delete(id);
      else next.add(id);
    }
    return next;
  });

  const routineOf = (id: string) => routines.find((routine) => routine.id === id);
  const editItem = (routine: Routine | undefined): ContextMenuItem[] => (routine ? [{ label: 'Edit routine…', onSelect: () => setEditing(routine) }] : []);
  const archiveItem = (routine: Routine | undefined): ContextMenuItem[] => (routine ? [{
    label: routine.isArchived ? 'Unarchive routine' : 'Archive routine',
    onSelect: () => {
      if (!routine.isArchived && editing?.id === routine.id) setEditing(undefined);
      void archiveRoutine(routine.id, !routine.isArchived);
    },
  }] : []);
  const deleteItem = (routine: Routine | undefined): ContextMenuItem[] => (routine ? [{ label: 'Delete routine…', danger: true, onSelect: () => setPendingDelete(routine) }] : []);

  function openBlockMenu(block: WeekBlock, x: number, y: number) {
    const routine = routineOf(block.routineId);
    if (!routine) return;
    const doneItem: ContextMenuItem = { label: block.isDone ? 'Mark not done' : 'Mark done', onSelect: () => void setCompleted(block.nodeId, !block.isDone) };
    const changeItems: ContextMenuItem[] = block.isDone ? [] : [
      { label: 'Skip this one', onSelect: () => void skipRoutine(routine.id, block.date, block.date) },
      { label: 'Skip this week', onSelect: () => void skipRoutine(routine.id, dates[0], dates[DAYS_IN_WEEK - 1]) },
      {
        label: 'Move to',
        submenu: dates.filter((date) => date !== block.date).map((date) => ({
          label: dayLabel(date),
          onSelect: () => void moveOccurrence(routine.id, block.date, date, block.startMinutes === null ? null : timeOfMinutes(block.startMinutes)),
        })),
      },
      {
        label: 'Pause from here',
        submenu: PAUSE_WEEKS.map((weeks) => ({
          label: weeks === 1 ? '1 week' : `${weeks} weeks`,
          onSelect: () => void skipRoutine(routine.id, block.date, addDays(block.date, weeks * DAYS_IN_WEEK - 1)),
        })),
      },
    ];
    setMenu({ x, y, items: [doneItem, ...changeItems, ...editItem(routine), ...archiveItem(routine), ...deleteItem(routine)] });
  }

  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="flex min-w-[300px] flex-1 flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold text-fg-prominent" style={{ fontSize: '0.95rem' }}>Routines</h2>
          <span className="text-fg-faint tabular-nums" style={{ fontSize: '0.8rem' }}>({liveRoutines.length})</span>
          <button type="button" onClick={() => setEditing(null)} className="ml-auto text-fg-muted transition-colors duration-panel ease-panel hover:text-fg-prominent" style={{ fontSize: '0.8rem' }}>+ New routine</button>
        </div>
        <RoutineList
          routines={liveRoutines}
          arcs={arcs}
          projects={projects}
          hiddenIds={hiddenIds}
          selectedId={editing?.id ?? null}
          progress={progress}
          nextDates={nextDates}
          history={history}
          onOpen={(routine) => setEditing((current) => (current?.id === routine.id ? undefined : routine))}
          onToggleRoutine={(id) => toggleHidden([id])}
          onToggleGroup={toggleHidden}
          onContextMenu={(routine, x, y) => setMenu({ x, y, items: [...editItem(routine), ...archiveItem(routine), ...deleteItem(routine)] })}
        />
        {archivedRoutines.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => setIsArchiveOpen((isOpen) => !isOpen)} className="self-start text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent" style={{ fontSize: '0.8rem' }}>
              {isArchiveOpen ? '▾' : '▸'} Archived ({archivedRoutines.length})
            </button>
            {isArchiveOpen && archivedRoutines.map((routine) => (
              <div
                key={routine.id}
                onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, items: [...archiveItem(routine), ...deleteItem(routine)] }); }}
                className="flex items-center gap-3 rounded-tab border border-border-subtle px-3 py-2 opacity-60"
              >
                <span className="min-w-0 flex-1 truncate text-fg-prominent">{routine.title}</span>
                <button type="button" onClick={() => void archiveRoutine(routine.id, false)} className="shrink-0 text-fg-muted transition-colors duration-panel ease-panel hover:text-fg-prominent" style={{ fontSize: '0.8rem' }}>Unarchive</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={columnRef} className="sticky shrink-0" style={{ width: WEEK_TIMELINE_WIDTH_PX, height: column.height, top: column.stickyTop }}>
        <RoutineWeekCalendar
          weekOffset={weekOffset}
          onWeekOffsetChange={setWeekOffset}
          dates={dates}
          blocks={blocks}
          onOpen={(block) => setEditing(routineOf(block.routineId))}
          onContextMenu={openBlockMenu}
        />
        {editorContent !== undefined && (
          <div className={`absolute inset-0 z-30 bg-bg ${editing === undefined ? 'routine-editor-out' : 'routine-editor-in'}`}>
            <RoutineForm
              key={editorContent?.id ?? 'new'}
              initial={editorContent}
              onSave={(id, fields) => { setEditing(undefined); void saveRoutine(id, fields); }}
              onCancel={() => setEditing(undefined)}
            />
          </div>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      {pendingDelete && (
        <ConfirmModal
          title="Delete routine?"
          body={`"${pendingDelete.title}" and its upcoming occurrences will be removed. Completed ones stay as history.`}
          confirmLabel="Delete"
          isDanger
          onConfirm={() => {
            if (editing?.id === pendingDelete.id) setEditing(undefined);
            void removeRoutine(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
