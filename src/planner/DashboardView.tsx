import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Play, Trash } from '@phosphor-icons/react';
import { ulid } from 'ulid';
import type { PlannerNode, Pool } from '../db/queries/planner/types';
import { ConfirmModal } from './ConfirmModal';
import { NodeRow } from './NodeRow';
import { SectionLabel } from './SectionLabel';
import { NewNodeButton } from './NewNodeButton';
import { SprintTag } from './SprintTag';
import { ArcIcon, ProjectIcon } from './plannerIcons';
import { DashboardQuickInput, type QuickCapture, type SprintRequest } from './DashboardQuickInput';
import { FlyingCard, type FlightRect } from './FlyingCard';
import { KEY_TARGETS, MOVE_BUTTONS, arrowBetween, POOL_ORDER, POOL_STYLES, TIER_NUMBER, type MoveKey } from './dashboardPools';
import { poolNodes, todaysEvents } from './hotLogic';
import { todayKey } from './nodeDerived';
import { POP_IN } from './plannerMotion';
import { usePlannerStore } from './plannerStore';
import { selectActiveSession, useSessionStore } from './sessionStore';
import { PROJECT_COLOR } from './quickAddMentions';

const UNDO_MS = 5000;
const SPRING = { type: 'spring', stiffness: 520, damping: 38 } as const;
const NO_ARC_COLOR = '#9a9a9a';
/** Every pool panel is the same flat background; one is tinted with its own color only while a card is dragged over it or about to land there. */
const PANEL_BACKGROUND = 'var(--color-dashboard-card-bg)';
const LIT_TINT_PCT = 14;
/** The one exception to the shared flat background: the Grill panel has a faint red wash and a red border. */
const REST_TINT_PCT: Partial<Record<Pool, number>> = { grill: 5 };
const BORDER_PCT: Partial<Record<Pool, number>> = { grill: 35 };
const LIT_BORDER_PCT = 70;
/** Narrowest an Inbox row column gets; the strip fits as many columns as the width allows. */
const COLUMN_BASIS_PX = 280;
/** The Inbox strip is full width, so its rows flow into as many columns as fit. */
const INBOX_ROWS_COLUMNS = `repeat(auto-fill, minmax(${COLUMN_BASIS_PX}px, 1fr))`;
const ACTION_CLASS =
  'shrink-0 rounded-tab border border-border-subtle px-2 py-0.5 text-fg-muted transition-all duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent';
/** A task card's hover/selected fill: opaque (page background nudged toward the
 *  text color), so the actions overlay below can match it exactly whatever panel
 *  the card sits in — a translucent tint would pick up that panel's own color. */
const TASK_FILL = 'color-mix(in srgb, var(--color-bg) 92%, var(--color-fg) 8%)';
const TASK_FILL_CLASS = 'bg-[color-mix(in_srgb,var(--color-bg)_92%,var(--color-fg)_8%)]';
const TASK_HOVER_FILL_CLASS = 'hover:bg-[color-mix(in_srgb,var(--color-bg)_92%,var(--color-fg)_8%)]';
/** The hover actions float over the row's right end instead of taking space in
 *  it, so a narrow card keeps its whole title. Filled like the hovered card and
 *  faded in from the left, so the title dissolves under the buttons rather than
 *  being cut off. */
const ACTIONS_OVERLAY_STYLE = {
  backgroundColor: TASK_FILL,
  maskImage: 'linear-gradient(to right, transparent, #000 1.5rem)',
  WebkitMaskImage: 'linear-gradient(to right, transparent, #000 1.5rem)',
} as const;

/** A new task's card flying from the quick input to its real row; `id` is that row's (pre-generated) node id. */
interface Flight {
  id: string;
  title: string;
  pool: Pool;
  arcId: string | null;
  from: FlightRect;
}

/** How long the new row takes to open up in its pool, so the panels resize while the card arrives. */
const GROW_S = 0.35;
/** Until the real row exists, the card heads for just under the target pool's header. */
const LANDING_OFFSET_PX = 46;
const LANDING_MARGIN_PX = 16;
/** How far the insertion line sits off the row edge it marks. */
const SLOT_LINE_GAP_PX = 3;
/** Gap under the bar when the target pool is hidden (an empty Inbox). */
const HIDDEN_POOL_DROP_PX = 28;

interface LastMove {
  /** Only keys the toast animation. */
  id: string;
  title: string;
  from: Pool;
  to: Pool;
}

interface TaskRowProps {
  task: PlannerNode;
  /** 1-based position, shown for Grill rows (the list is a ranking). */
  rank?: number;
  /** True while this new task's card is still flying in: the row opens up but stays invisible until the card lands on it. */
  isArriving: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onMove: (to: Pool) => void;
  onDelete: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onDrag: (x: number, y: number) => void;
  onDrop: (x: number, y: number) => void;
}

/** One task, drawn like the planner's NodeRow: arc-colored check dot, title, arc tag line, quick move buttons. */
function TaskRow({ task, rank, isArriving, isSelected, onSelect, onToggle, onMove, onDelete, onKeyDown, onDrag, onDrop }: TaskRowProps) {
  const arc = usePlannerStore((state) => state.arcs).find((candidate) => candidate.id === task.arcId);
  const project = usePlannerStore((state) => state.projects).find((candidate) => candidate.id === task.projectId);
  const color = arc?.colorHex ?? NO_ARC_COLOR;
  const meta = task.dueAt ? `due ${task.dueAt === todayKey() ? 'today' : task.dueAt}` : '';
  const isCold = task.pool === 'cold' || task.pool === 'freezer';
  const targets = MOVE_BUTTONS[task.pool];
  const isGrill = task.pool === 'grill';
  /** Releasing a drag also fires a click; that one must not select the card. */
  const didDrag = useRef(false);
  /** While held, the card follows the pointer alone: layout tracking would re-measure it on every pointer move and creep it upward. */
  const [isDragging, setIsDragging] = useState(false);
  const sessions = useSessionStore((state) => state.sessions);
  const sessionNodes = useSessionStore((state) => state.sessionNodes);
  const doNow = useSessionStore((state) => state.doNow);
  const active = selectActiveSession({ sessions });
  const isDoing = active !== null && sessionNodes.some((entry) => entry.sessionId === active.id && entry.nodeId === task.id && entry.status === 'in_progress');
  /** A session works on one node at a time, so while any node is in progress nothing else can be started. */
  const isSessionBusy = active !== null && sessionNodes.some((entry) => entry.sessionId === active.id && entry.status === 'in_progress');

  return (
    <motion.div
      layoutId={task.id}
      layout={isArriving ? 'position' : !isDragging}
      initial={isArriving ? { height: 0 } : undefined}
      animate={isArriving ? { height: 'auto' } : undefined}
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.15}
      whileDrag={{ scale: 1.02, zIndex: 50, boxShadow: '0 10px 28px rgba(0,0,0,0.45)', cursor: 'grabbing' }}
      transition={isArriving ? { ...SPRING, height: { duration: GROW_S, ease: 'easeOut' } } : SPRING}
      tabIndex={0}
      data-task-id={task.id}
      onKeyDown={onKeyDown}
      onClick={() => {
        if (didDrag.current) didDrag.current = false;
        else onSelect();
      }}
      onDragStart={() => { didDrag.current = true; setIsDragging(true); }}
      onDrag={(event) => onDrag((event as PointerEvent).clientX, (event as PointerEvent).clientY)}
      onDragEnd={(event) => {
        setIsDragging(false);
        onDrop((event as PointerEvent).clientX, (event as PointerEvent).clientY);
      }}
      className={`group relative flex cursor-grab items-center gap-3 rounded-tab border px-3 outline-none transition-colors duration-panel ease-panel ${TASK_HOVER_FILL_CLASS} focus-visible:border-border-strong ${
        isSelected ? `border-border-strong ${TASK_FILL_CLASS}` : 'border-border-subtle bg-bg'
      } ${isDoing ? 'doing-pulse' : ''}`}
      style={{ paddingTop: isCold ? '0.35rem' : isGrill ? '0.7rem' : '0.5rem', paddingBottom: isCold ? '0.35rem' : isGrill ? '0.7rem' : '0.5rem', visibility: isArriving ? 'hidden' : undefined, borderColor: isDoing ? 'var(--accent-status-dot)' : undefined }}
    >
      {rank !== undefined && <span className="w-3 shrink-0 text-center tabular-nums text-fg-faint" style={{ fontSize: '0.8rem' }}>{rank}</span>}
      <button
        type="button"
        aria-label={task.isCompleted ? 'mark not done' : 'mark done'}
        onClick={(event) => { event.stopPropagation(); onToggle(); }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-panel ease-panel"
        style={{ borderColor: color, background: task.isCompleted ? color : 'transparent' }}
      >
        <AnimatePresence initial={false}>
          {task.isCompleted && <motion.span key="check" {...POP_IN} exit={{ opacity: 0, scale: 0.4 }} className="flex"><Check size={10} weight="bold" color="#000" /></motion.span>}
        </AnimatePresence>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`truncate ${task.isCompleted ? 'text-fg-faint line-through' : isCold ? 'text-fg-muted' : 'text-fg-prominent'}`} style={isGrill ? { fontSize: '0.95rem', fontWeight: 500 } : undefined}>
          {task.importanceLevel === 1 && <span className="mr-1 text-accent-warning">★</span>}
          {task.title}
        </span>
        {!isCold && !task.isCompleted && (
          <span className="flex min-w-0 items-center gap-2 truncate whitespace-nowrap" style={{ fontSize: '0.68rem' }}>
            {!arc && !project && <span className="text-fg-faint">no arc</span>}
            {arc && <span className="flex shrink-0 items-center gap-1" style={{ color: arc.colorHex }}><ArcIcon arc={arc} size={11} />{arc.name}</span>}
            {project && <span className="flex min-w-0 items-center gap-1" style={{ color: PROJECT_COLOR }}><ProjectIcon project={project} size={11} className="shrink-0" /><span className="truncate">{project.name}</span></span>}
            <SprintTag sprintId={task.sprintId} />
          </span>
        )}
      </div>

      {meta && <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.72rem' }}>{meta}</span>}

      <AnimatePresence initial={false}>
        {isDoing && (
          <motion.span key="doing" {...POP_IN} exit={{ opacity: 0, scale: 0.4 }} className="shrink-0" style={{ fontSize: '0.72rem', color: 'var(--accent-status-dot)' }}>
            ● doing
          </motion.span>
        )}
      </AnimatePresence>
      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-3 rounded-r-tab pl-8 pr-3 opacity-0 transition-opacity duration-panel ease-panel focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
        style={ACTIONS_OVERLAY_STYLE}
      >
        {active && !isSessionBusy && !task.isCompleted && (
          <button
            type="button"
            title="add to the live session and start it"
            onClick={(event) => { event.stopPropagation(); void doNow(task.id); }}
            className="flex shrink-0 items-center gap-1 rounded-tab border border-border-subtle px-2 py-0.5 text-fg-muted transition-all duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent"
            style={{ fontSize: '0.7rem' }}
          >
            <Play size={10} weight="fill" style={{ color: 'var(--accent-status-dot)' }} />
            Do now
          </button>
        )}

        {targets.map((pool) => (
          <button key={pool} type="button" onClick={(event) => { event.stopPropagation(); onMove(pool); }} className={ACTION_CLASS} style={{ fontSize: '0.7rem' }}>{arrowBetween(task.pool, pool)} {POOL_STYLES[pool].label}</button>
        ))}
        <button
          type="button"
          aria-label="delete task"
          title="delete"
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          className="flex shrink-0 items-center p-0.5 text-fg-faint transition-colors duration-panel ease-panel hover:text-accent-link-broken"
        >
          <Trash size={13} />
        </button>
      </div>
    </motion.div>
  );
}

/** The dashboard: a quick input over the three pools, backed by the planner store. Type `@hot`, drag a row across, press ← / → / ↑, or use the row buttons to move tasks. */
interface DashboardViewProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewNode: () => void;
  /** Where the quick-add row is rendered: PlannerView's pinned header, so it stays put while the page scrolls. */
  toolbarSlot: HTMLElement | null;
  /** Set when a sprint is clicked in the sprint box, to start typing a task into it. */
  sprintRequest: SprintRequest | null;
}

export function DashboardView({ selectedId, onSelect, onNewNode, toolbarSlot, sprintRequest }: DashboardViewProps) {
  const { nodes, arcs, addNode, editNode, setCompleted, removeNode, reorderNodes } = usePlannerStore();
  /** Where a card dragged over Grill would be inserted: its index among the other Grill rows, and the line's top offset in the panel. */
  const [grillSlot, setGrillSlot] = useState<{ index: number; top: number } | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const [isInboxClipped, setIsInboxClipped] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PlannerNode | null>(null);
  const [dragPool, setDragPool] = useState<Pool | null>(null);
  const [previewPool, setPreviewPool] = useState<Pool | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const columnRefs = useRef<Partial<Record<Pool, HTMLElement | null>>>({});
  const toastCount = useRef(0);

  // Auto-dismiss the undo toast.
  useEffect(() => {
    if (!lastMove) return;
    const timer = window.setTimeout(() => setLastMove(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [lastMove]);

  // Keep keyboard focus on a row after it jumps columns.
  useEffect(() => {
    if (!focusId) return;
    document.querySelector<HTMLElement>(`[data-task-id="${focusId}"]`)?.focus();
    setFocusId(null);
  }, [focusId, nodes]);

  function poolAt(x: number, y: number): Pool | null {
    return POOL_ORDER.find((pool) => {
      const rect = columnRefs.current[pool]?.getBoundingClientRect();
      return rect !== undefined && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }) ?? null;
  }

  const grillIds = () => poolNodes(nodes, 'grill').map((node) => node.id);

  /** Where a card released at screen height `y` would slot into Grill, ignoring the card itself. */
  function grillSlotAt(y: number, draggedId: string): { index: number; top: number } | null {
    const panel = columnRefs.current.grill;
    if (!panel) return null;
    const rows = [...panel.querySelectorAll<HTMLElement>('[data-task-id]')].filter((row) => row.dataset.taskId !== draggedId);
    const found = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    const index = found === -1 ? rows.length : found;
    const panelTop = panel.getBoundingClientRect().top;
    const edge = rows.length === 0
      ? panel.getBoundingClientRect().top + LANDING_OFFSET_PX
      : index < rows.length
        ? rows[index].getBoundingClientRect().top - SLOT_LINE_GAP_PX
        : rows[rows.length - 1].getBoundingClientRect().bottom + SLOT_LINE_GAP_PX;
    return { index, top: edge - panelTop };
  }

  /** Puts a task in Grill at `index` among the others (past the end appends) and saves the whole ranking. */
  async function placeInGrill(task: PlannerNode, index: number) {
    const others = grillIds().filter((id) => id !== task.id);
    const ordered = [...others.slice(0, index), task.id, ...others.slice(index)];
    if (task.pool === 'grill' && ordered.join() === grillIds().join()) return;
    if (task.pool !== 'grill') {
      await editNode(task.id, { pool: 'grill' });
      setLastMove({ id: task.id, title: task.title, from: task.pool, to: 'grill' });
    }
    await reorderNodes(ordered);
  }

  function moveTask(task: PlannerNode, to: Pool) {
    if (task.pool === to) return;
    if (to === 'grill') {
      void placeInGrill(task, Infinity);
      return;
    }
    void editNode(task.id, { pool: to });
    setLastMove({ id: task.id, title: task.title, from: task.pool, to });
  }

  /** Alt+↑/↓ on a Grill card: one rank up or down. */
  function nudgeInGrill(task: PlannerNode, step: -1 | 1) {
    const ids = grillIds();
    const from = ids.indexOf(task.id);
    const to = from + step;
    if (from === -1 || to < 0 || to >= ids.length) return;
    const ordered = [...ids];
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    void reorderNodes(ordered);
    setFocusId(task.id);
  }

  function undo() {
    if (!lastMove) return;
    void editNode(lastMove.id, { pool: lastMove.from });
    setLastMove(null);
  }

  function onKeyDown(event: React.KeyboardEvent, task: PlannerNode) {
    if (event.target !== event.currentTarget) return;
    if (event.altKey && task.pool === 'grill' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      nudgeInGrill(task, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    const target = KEY_TARGETS[task.pool][event.key as MoveKey];
    if (!target) return;
    event.preventDefault();
    moveTask(task, target);
    setFocusId(task.id);
  }

  function saveCapture({ title, pool, arcId, projectId, sprintId }: QuickCapture, id: string = ulid()) {
    toastCount.current += 1;
    const rankedIds = grillIds();
    void (async () => {
      await addNode({ id, title, pool, arcId, projectId, sprintId });
      if (pool === 'grill') await reorderNodes([...rankedIds, id]);
    })();
    setLastMove({ id: `added-${toastCount.current}`, title, from: pool, to: pool });
  }

  /** Saves right away under a known id and sends a card from the bar to that row, which opens up in its pool as the card arrives. */
  function capture(input: QuickCapture) {
    const { fromRect, pool, title, arcId } = input;
    if (!fromRect || shouldReduceMotion) {
      saveCapture(input);
      return;
    }
    const id = ulid();
    const from = { x: fromRect.left, y: fromRect.top, w: fromRect.width, h: fromRect.height };
    setFlights((current) => [...current, { id, title, pool, arcId, from }]);
    saveCapture(input, id);
  }

  /** Where a card heads before its real row exists. */
  function fallbackRect({ pool, from }: Flight): FlightRect {
    const panel = columnRefs.current[pool]?.getBoundingClientRect();
    const target = panel
      ? { x: panel.left + 12, y: panel.top + LANDING_OFFSET_PX, w: Math.min(panel.width - 24, from.w), h: from.h }
      : { x: from.x, y: from.y + from.h + HIDDEN_POOL_DROP_PX, w: from.w, h: from.h };
    return { ...target, y: Math.max(LANDING_MARGIN_PX, Math.min(target.y, window.innerHeight - from.h - LANDING_MARGIN_PX)) };
  }

  const land = (id: string) => setFlights((current) => current.filter((flight) => flight.id !== id));
  const arrivingIds = new Set(flights.map((flight) => flight.id));

  const litPool = dragPool ?? previewPool;
  /** The Inbox is a landing strip, so it only takes up room while something is waiting in it. */
  const hasInbox = poolNodes(nodes, 'inbox').length > 0;
  const events = todaysEvents(nodes);

  /** One pool's panel: header, empty text and its rows. */
  function renderPool(pool: Pool) {
    const { label, Icon: PoolIcon, color, emptyText } = POOL_STYLES[pool];
    const items = poolNodes(nodes, pool);
    const isLit = litPool === pool;
    const borderPct = BORDER_PCT[pool];
    const restTint = REST_TINT_PCT[pool];
    const restBackground = restTint ? `color-mix(in srgb, ${color} ${restTint}%, ${PANEL_BACKGROUND})` : PANEL_BACKGROUND;
    return (
      <section
        ref={(element) => { columnRefs.current[pool] = element; }}
        className="relative flex flex-col gap-1.5 rounded-tab p-3 transition-colors duration-panel ease-panel"
        style={{
          border: borderPct ? `1px solid color-mix(in srgb, ${color} ${isLit ? LIT_BORDER_PCT : borderPct}%, transparent)` : pool === 'inbox' ? undefined : '1px solid var(--border-card)',
          background: isLit ? `color-mix(in srgb, ${color} ${LIT_TINT_PCT}%, ${restBackground})` : restBackground,
        }}
      >
        <header className="flex items-center gap-2 px-1 pb-1.5">
          <PoolIcon size={18} weight={pool === 'hot' || pool === 'grill' ? 'fill' : 'regular'} style={{ color }} />
          <h3 className="font-semibold" style={{ fontSize: '1.05rem', color }}>{TIER_NUMBER[pool] !== undefined && <span className="mr-1.5 tabular-nums opacity-70">{TIER_NUMBER[pool]}</span>}{label}</h3>
          <span className="text-fg-faint tabular-nums" style={{ fontSize: '0.8rem' }}>({items.length})</span>
          {pool === 'grill' && items.length > 1 && <span className="ml-auto text-fg-faint" style={{ fontSize: '0.7rem' }}>drag or Alt+↑↓ to rank</span>}
        </header>

        {pool === 'grill' && grillSlot && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-3 right-3 z-10 h-0.5 rounded-full"
            style={{ top: grillSlot.top, background: color }}
          />
        )}

        {items.length === 0 && <p className="px-1 py-4 text-center text-fg-faint">{emptyText}</p>}

        <div className="grid gap-1.5" style={{ gridTemplateColumns: pool === 'inbox' ? INBOX_ROWS_COLUMNS : '1fr' }}>
          <AnimatePresence initial={false}>
            {items.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                rank={pool === 'grill' ? index + 1 : undefined}
                isArriving={arrivingIds.has(task.id)}
                isSelected={task.id === selectedId}
                onSelect={() => onSelect(task.id)}
                onToggle={() => void setCompleted(task.id, !task.isCompleted)}
                onMove={(to) => moveTask(task, to)}
                onDelete={() => setPendingDelete(task)}
                onKeyDown={(event) => onKeyDown(event, task)}
                onDrag={(x, y) => {
                  const over = poolAt(x, y);
                  setDragPool(over);
                  const slot = over === 'grill' ? grillSlotAt(y, task.id) : null;
                  setGrillSlot((current) => (current?.index === slot?.index && current?.top === slot?.top ? current : slot));
                }}
                onDrop={(x, y) => {
                  setDragPool(null);
                  setGrillSlot(null);
                  const target = poolAt(x, y);
                  if (target === 'grill') void placeInGrill(task, grillSlotAt(y, task.id)?.index ?? Infinity);
                  else if (target) moveTask(task, target);
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {toolbarSlot &&
        createPortal(
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <DashboardQuickInput onCommit={capture} onPreviewPool={setPreviewPool} sprintRequest={sprintRequest} />
            </div>
            <NewNodeButton onClick={onNewNode} />
          </div>,
          toolbarSlot,
        )}

      <AnimatePresence initial={false}>
        {hasInbox && (
          <motion.div
            key="inbox"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: GROW_S, ease: 'easeOut' }}
            onAnimationStart={() => setIsInboxClipped(true)}
            onAnimationComplete={() => setIsInboxClipped(false)}
            style={{ overflow: isInboxClipped ? 'hidden' : 'visible' }}
          >
            {renderPool('inbox')}
          </motion.div>
        )}
      </AnimatePresence>

      {events.length > 0 && (
        <section className="mb-3 flex flex-col gap-1.5">
          <SectionLabel label="Events today" count={events.length} />
          <AnimatePresence initial={false}>
            {events.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                isSelected={node.id === selectedId}
                onSelect={() => onSelect(node.id)}
                onToggle={() => void setCompleted(node.id, !node.isCompleted)}
              />
            ))}
          </AnimatePresence>
        </section>
      )}

      {renderPool('grill')}
      {renderPool('hot')}
      {renderPool('cold')}
      {renderPool('freezer')}

      {flights.map((flight) => (
        <FlyingCard
          key={flight.id}
          nodeId={flight.id}
          title={flight.title}
          dotColor={arcs.find((candidate) => candidate.id === flight.arcId)?.colorHex ?? NO_ARC_COLOR}
          from={flight.from}
          getFallback={() => fallbackRect(flight)}
          onDone={() => land(flight.id)}
        />
      ))}

      {pendingDelete && (
        <ConfirmModal
          title="Delete task?"
          body={`“${pendingDelete.title}” and its subtasks will be deleted for good.`}
          confirmLabel="Delete"
          isDanger
          onConfirm={() => {
            void removeNode(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <AnimatePresence>
        {lastMove && (
          <motion.div
            key={lastMove.id + lastMove.to}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-tab border border-border-strong bg-bg px-4 py-2 text-fg-prominent shadow-lg"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: POOL_STYLES[lastMove.to].color }} />
            <span className="max-w-[20rem] truncate">
              {lastMove.from === lastMove.to ? 'Added' : 'Moved'} “{lastMove.title}” to {POOL_STYLES[lastMove.to].label}
            </span>
            {lastMove.from !== lastMove.to && <button type="button" onClick={undo} className="text-accent-link hover:text-fg-prominent">Undo</button>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
