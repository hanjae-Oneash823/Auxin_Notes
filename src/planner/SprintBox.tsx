import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, Reorder, motion, useReducedMotion } from 'framer-motion';
import { Check, PersonSimpleRun } from '@phosphor-icons/react';
import { ContextMenu } from '../layout/ContextMenu';
import type { Sprint } from '../db/queries/planner/types';
import { ProgressRing } from './ProgressRing';
import { RunnerFigure } from './RunnerFigure';
import { usePlannerStore } from './plannerStore';
import { PlannerSelect, type SelectGroup } from './PlannerSelect';
import { FIELD_CLASS } from './plannerStyles';
import { SPRINT_SOFT_LIMIT, activeSprints, scopeFromValue, sprintColor, sprintProgress } from './sprintDerived';

/** How long the end-sprint celebration plays before the sprint is actually ended and its row collapses. */
const END_CELEBRATION_MS = 750;
/** The runner beside each card runs faster the more of the sprint is done. */
/** Seconds per stride at 0% and at 100% progress. */
const SLOWEST_CYCLE_S = 1.2;
const FASTEST_CYCLE_S = 0.45;
const strideSeconds = (progress: number): number => SLOWEST_CYCLE_S + (FASTEST_CYCLE_S - SLOWEST_CYCLE_S) * progress;
/** The big rank numbers to the left of each card. */
const RANK_FONT_REM = 1.7;

interface SprintBoxProps {
  /** Called when a sprint's name is clicked, to start typing a task into it. */
  onPick: (sprint: Sprint) => void;
}

/** The dashboard's box of active sprints: hand-ranked, with progress. Click a name to add a task to it. */
export function SprintBox({ onPick }: SprintBoxProps) {
  const { sprints, nodes, arcs, projects, addSprint, renameSprint, endSprint, reorderSprints } = usePlannerStore();
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; sprint: Sprint } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const endTimer = useRef<number | undefined>(undefined);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => () => window.clearTimeout(endTimer.current), []);

  const active = activeSprints(sprints);
  const activeKey = active.map((sprint) => sprint.id).join();
  /** The ranking as shown: follows the drag while it is under way, and the saved order otherwise. */
  const [order, setOrder] = useState<string[]>(() => active.map((sprint) => sprint.id));
  useEffect(() => setOrder(activeKey ? activeKey.split(',') : []), [activeKey]);
  const shown = [...order.filter((id) => active.some((sprint) => sprint.id === id)), ...active.map((sprint) => sprint.id).filter((id) => !order.includes(id))];
  const saveOrder = () => {
    if (shown.join() !== activeKey) void reorderSprints(shown);
  };
  const scopeLabel = (sprint: Sprint) =>
    projects.find((project) => project.id === sprint.projectId)?.name ?? arcs.find((arc) => arc.id === sprint.arcId)?.name ?? null;

  /** Standalone, then each active arc with its active projects, then projects that sit in no arc. */
  const activeProjects = projects.filter((project) => project.status === 'active');
  const scopeGroups: SelectGroup[] = [
    { options: [{ value: '', label: 'Standalone' }] },
    ...arcs.filter((arc) => arc.status === 'active').map((arc): SelectGroup => ({
      label: arc.name,
      options: [
        { value: `arc:${arc.id}`, label: arc.name },
        ...activeProjects.filter((project) => project.arcId === arc.id).map((project) => ({ value: `project:${project.id}`, label: project.name })),
      ],
    })),
    ...(activeProjects.some((project) => !project.arcId)
      ? [{ label: 'No arc', options: activeProjects.filter((project) => !project.arcId).map((project) => ({ value: `project:${project.id}`, label: project.name })) }]
      : []),
  ];

  function commitRename(sprint: Sprint) {
    const name = renaming?.draft.trim();
    setRenaming(null);
    if (name && name !== sprint.name) void renameSprint(sprint.id, name);
  }

  /** Fills the bar and pops a check where the rank number was, then ends the sprint so the row collapses away. */
  function end(sprint: Sprint) {
    if (endingId) return;
    if (shouldReduceMotion) {
      void endSprint(sprint.id);
      return;
    }
    setEndingId(sprint.id);
    endTimer.current = window.setTimeout(() => {
      void endSprint(sprint.id);
      setEndingId(null);
    }, END_CELEBRATION_MS);
  }

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    void addSprint({ name: trimmed, ...scopeFromValue(scope, projects) });
    setName('');
    setScope('');
    setIsAdding(false);
  }

  return (
    <section data-keep-selection className="flex flex-col gap-1.5 rounded-tab border border-border-subtle p-3.5">
      <header className="flex items-center gap-2 px-1 pb-1">
        <PersonSimpleRun size={16} weight="bold" className="text-fg-prominent" />
        <h3 className="font-semibold text-fg-prominent" style={{ fontSize: '0.95rem' }}>Sprints</h3>
        <span className="text-fg-faint tabular-nums" style={{ fontSize: '0.8rem' }}>({active.length})</span>
        <button
          type="button"
          onClick={() => setIsAdding((value) => !value)}
          className="ml-auto text-fg-muted transition-colors duration-panel ease-panel hover:text-fg-prominent"
          style={{ fontSize: '0.8rem' }}
        >
          + New sprint
        </button>
      </header>

      {active.length > SPRINT_SOFT_LIMIT && (
        <p role="status" className="px-1 text-accent-warning" style={{ fontSize: '0.75rem' }}>
          {active.length} active sprints. Past {SPRINT_SOFT_LIMIT}, none of them stands out; consider ending some.
        </p>
      )}

      {isAdding && (
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create();
              if (event.key === 'Escape') setIsAdding(false);
            }}
            placeholder="Sprint name, then Enter"
            aria-label="Sprint name"
            className={`${FIELD_CLASS} min-w-[160px] flex-1`}
          />
          <PlannerSelect value={scope} onChange={setScope} groups={scopeGroups} ariaLabel="Sprint scope" className="min-w-[140px]" />
        </div>
      )}

      {active.length === 0 && !isAdding && <p className="px-1 py-3 text-center text-fg-faint">No active sprints. Start one for a short-term theme.</p>}

      <Reorder.Group as="div" axis="y" values={shown} onReorder={setOrder} className="flex flex-col">
      <AnimatePresence initial={false}>
        {shown.map((id, index) => {
          const sprint = active.find((candidate) => candidate.id === id);
          if (!sprint) return null;
          const { done, total } = sprintProgress(nodes, sprint.id);
          const color = sprintColor(sprint, arcs);
          const scopeName = scopeLabel(sprint);
          const isEnding = endingId === sprint.id;
          const fraction = isEnding ? 1 : total === 0 ? 0 : done / total;
          return (
            <Reorder.Item
              as="div"
              key={sprint.id}
              value={sprint.id}
              layout="position"
              onDragEnd={saveOrder}
              onContextMenu={(event: React.MouseEvent) => {
                event.preventDefault();
                setMenu({ x: event.clientX, y: event.clientY, sprint });
              }}
              whileDrag={{ scale: 1.02, backgroundColor: 'var(--color-bg)', cursor: 'grabbing' }}
              exit={{ height: 0, opacity: 0, x: 28, transition: { duration: 0.28, ease: 'easeIn' } }}
              className="cursor-grab overflow-hidden rounded-tab"
            >
              <div
                className="group relative grid grid-cols-[2rem_36px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-tab px-1.5 py-1.5 transition-colors duration-panel ease-panel hover:bg-border-subtle"
                style={isEnding ? { background: `color-mix(in srgb, ${color} 18%, transparent)` } : undefined}
              >
                <span aria-hidden className="relative flex w-8 shrink-0 items-center justify-center font-mono font-semibold leading-none tabular-nums" style={{ fontSize: `${RANK_FONT_REM}rem`, color }}>
                  {isEnding ? (
                    <>
                      <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: [0, 1.4, 1], rotate: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="inline-flex" style={{ color }}>
                        <Check size={26} weight="bold" />
                      </motion.span>
                      <motion.span
                        className="pointer-events-none absolute inset-0 rounded-full border-2"
                        style={{ borderColor: color }}
                        initial={{ scale: 0.6, opacity: 0.8 }}
                        animate={{ scale: 1.8, opacity: 0 }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </>
                  ) : (
                    index + 1
                  )}
                </span>
                <RunnerFigure color={color} cycleSeconds={strideSeconds(fraction)} />
                <div className="flex min-w-0 flex-col gap-1">
                  {renaming?.id === sprint.id ? (
                    <input
                      autoFocus
                      value={renaming.draft}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => setRenaming({ id: sprint.id, draft: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename(sprint);
                        if (event.key === 'Escape') setRenaming(null);
                      }}
                      onBlur={() => commitRename(sprint)}
                      onPointerDown={(event) => event.stopPropagation()}
                      aria-label="Sprint name"
                      className="min-w-0 border border-border-strong bg-bg-packet px-1.5 py-0 font-medium text-fg-prominent outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPick(sprint)}
                      title="Add a task to this sprint"
                      className="min-w-0 max-w-full self-start truncate text-left font-medium text-fg-prominent hover:underline"
                      style={arcs.some((arc) => arc.id === sprint.arcId) ? { color } : undefined}
                    >
                      {sprint.name}
                    </button>
                  )}
                  <span className="min-w-0 truncate text-fg-faint" style={{ fontSize: '0.72rem' }}>{scopeName ?? 'Standalone'}</span>
                </div>
                <span className="flex w-[4.75rem] items-center justify-end gap-3">
                  <ProgressRing fraction={fraction} color={color} label={`${sprint.name} progress`} value={done} max={total} isGlowing={isEnding} />
                  <span className="text-fg-faint tabular-nums" style={{ fontSize: '0.75rem' }}>{done}/{total}</span>
                </span>
              </div>
            </Reorder.Item>
          );
        })}
      </AnimatePresence>
      </Reorder.Group>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={[
            { label: 'Rename', onSelect: () => setRenaming({ id: menu.sprint.id, draft: menu.sprint.name }) },
            { label: 'End sprint', onSelect: () => end(menu.sprint) },
          ]} onClose={() => setMenu(null)} />
      )}
    </section>
  );
}
