import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Trash } from '@phosphor-icons/react';
import { ulid } from 'ulid';
import type { PlannerNode, Pool } from '../db/queries/planner/types';
import { ConfirmModal } from './ConfirmModal';
import { DashboardQuickInput, type QuickCapture } from './DashboardQuickInput';
import { FlyingCard, type FlightRect } from './FlyingCard';
import { KEY_TARGETS, MOVE_BUTTONS, arrowBetween, POOL_ORDER, POOL_STYLES, TIER_NUMBER, type MoveKey } from './dashboardPools';
import { poolNodes } from './hotLogic';
import { todayKey } from './nodeDerived';
import { POP_IN } from './plannerMotion';
import { usePlannerStore } from './plannerStore';
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
/** Two rows under the Inbox: Grill | Hot, then Cold | Freezer. Each pair sits side by side and wraps when narrow. */
const COLUMN_BASIS_PX = 280;
const PANEL_FLEX = `1 1 ${COLUMN_BASIS_PX}px`;
const MIN_HEIGHT_PX: Record<Pool, number> = { inbox: 110, grill: 150, hot: 150, cold: 130, freezer: 130 };
/** The Inbox strip is full width, so its rows flow into as many columns as fit. */
const INBOX_ROWS_COLUMNS = `repeat(auto-fill, minmax(${COLUMN_BASIS_PX}px, 1fr))`;
const ACTION_CLASS =
  'shrink-0 rounded-tab border border-border-subtle px-2 py-0.5 text-fg-muted opacity-0 transition-all duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent focus-visible:opacity-100 group-hover:opacity-100';

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
  onToggle: () => void;
  onMove: (to: Pool) => void;
  onDelete: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onDrag: (x: number, y: number) => void;
  onDrop: (x: number, y: number) => void;
}

/** One task, drawn like the planner's NodeRow: arc-colored check dot, title, arc tag line, quick move buttons. */
function TaskRow({ task, rank, isArriving, onToggle, onMove, onDelete, onKeyDown, onDrag, onDrop }: TaskRowProps) {
  const arc = usePlannerStore((state) => state.arcs).find((candidate) => candidate.id === task.arcId);
  const project = usePlannerStore((state) => state.projects).find((candidate) => candidate.id === task.projectId);
  const color = arc?.colorHex ?? NO_ARC_COLOR;
  const meta = task.dueAt ? `due ${task.dueAt === todayKey() ? 'today' : task.dueAt}` : '';
  const isCold = task.pool === 'cold' || task.pool === 'freezer';
  const targets = MOVE_BUTTONS[task.pool];
  const isGrill = task.pool === 'grill';

  return (
    <motion.div
      layoutId={task.id}
      layout={isArriving ? 'position' : true}
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
      onDrag={(event) => onDrag((event as PointerEvent).clientX, (event as PointerEvent).clientY)}
      onDragEnd={(event) => onDrop((event as PointerEvent).clientX, (event as PointerEvent).clientY)}
      className="group flex cursor-grab items-center gap-3 rounded-tab border border-border-subtle bg-bg px-3 outline-none transition-colors duration-panel ease-panel hover:bg-border-subtle focus-visible:border-border-strong"
      style={{ paddingTop: isCold ? '0.35rem' : isGrill ? '0.7rem' : '0.5rem', paddingBottom: isCold ? '0.35rem' : isGrill ? '0.7rem' : '0.5rem', visibility: isArriving ? 'hidden' : undefined }}
    >
      {rank !== undefined && <span className="w-3 shrink-0 text-center tabular-nums text-fg-faint" style={{ fontSize: '0.8rem' }}>{rank}</span>}
      <button
        type="button"
        aria-label={task.isCompleted ? 'mark not done' : 'mark done'}
        onClick={onToggle}
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
            {arc && <span className="shrink-0" style={{ color: arc.colorHex }}>{arc.name}</span>}
            {project && <span className="truncate" style={{ color: PROJECT_COLOR }}>{project.name}</span>}
          </span>
        )}
      </div>

      {meta && <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.72rem' }}>{meta}</span>}

      {targets.map((pool) => (
        <button key={pool} type="button" onClick={() => onMove(pool)} className={ACTION_CLASS} style={{ fontSize: '0.7rem' }}>{arrowBetween(task.pool, pool)} {POOL_STYLES[pool].label}</button>
      ))}
      <button
        type="button"
        aria-label="delete task"
        title="delete"
        onClick={onDelete}
        className="flex shrink-0 items-center p-0.5 text-fg-faint opacity-0 transition-colors duration-panel ease-panel hover:text-accent-link-broken focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash size={13} />
      </button>
    </motion.div>
  );
}

/** The dashboard: a quick input over the three pools, backed by the planner store. Type `@hot`, drag a row across, press ← / → / ↑, or use the row buttons to move tasks. */
export function DashboardView() {
  const { nodes, arcs, addNode, editNode, setCompleted, removeNode } = usePlannerStore();
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

  function moveTask(task: PlannerNode, to: Pool) {
    if (task.pool === to) return;
    void editNode(task.id, { pool: to });
    setLastMove({ id: task.id, title: task.title, from: task.pool, to });
  }

  function undo() {
    if (!lastMove) return;
    void editNode(lastMove.id, { pool: lastMove.from });
    setLastMove(null);
  }

  function onKeyDown(event: React.KeyboardEvent, task: PlannerNode) {
    if (event.target !== event.currentTarget) return;
    const target = KEY_TARGETS[task.pool][event.key as MoveKey];
    if (!target) return;
    event.preventDefault();
    moveTask(task, target);
    setFocusId(task.id);
  }

  function saveCapture({ title, pool, arcId }: QuickCapture, id?: string) {
    toastCount.current += 1;
    void addNode({ id, title, pool, arcId });
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
        className={`flex flex-col gap-1.5 rounded-tab p-3 transition-colors duration-panel ease-panel `}
        style={{
          flex: pool === 'inbox' ? undefined : PANEL_FLEX,
          minHeight: MIN_HEIGHT_PX[pool],
          minWidth: 0,
          border: borderPct ? `1px solid color-mix(in srgb, ${color} ${isLit ? LIT_BORDER_PCT : borderPct}%, transparent)` : undefined,
          background: isLit ? `color-mix(in srgb, ${color} ${LIT_TINT_PCT}%, ${restBackground})` : restBackground,
        }}
      >
        <header className="flex items-center gap-2 px-1 pb-1.5">
          <PoolIcon size={18} weight={pool === 'hot' || pool === 'grill' ? 'fill' : 'regular'} style={{ color }} />
          <h3 className="font-semibold" style={{ fontSize: '1.05rem', color }}>{TIER_NUMBER[pool] !== undefined && <span className="mr-1.5 tabular-nums opacity-70">{TIER_NUMBER[pool]}</span>}{label}</h3>
          <span className="text-fg-faint tabular-nums" style={{ fontSize: '0.8rem' }}>({items.length})</span>
        </header>

        {items.length === 0 && <p className="px-1 py-4 text-center text-fg-faint">{emptyText}</p>}

        <div className="grid gap-1.5" style={{ gridTemplateColumns: pool === 'inbox' ? INBOX_ROWS_COLUMNS : '1fr' }}>
          <AnimatePresence initial={false}>
            {items.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                rank={pool === 'grill' ? index + 1 : undefined}
                isArriving={arrivingIds.has(task.id)}
                onToggle={() => void setCompleted(task.id, !task.isCompleted)}
                onMove={(to) => moveTask(task, to)}
                onDelete={() => setPendingDelete(task)}
                onKeyDown={(event) => onKeyDown(event, task)}
                onDrag={(x, y) => setDragPool(poolAt(x, y))}
                onDrop={(x, y) => {
                  setDragPool(null);
                  const target = poolAt(x, y);
                  if (target) moveTask(task, target);
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DashboardQuickInput onCommit={capture} onPreviewPool={setPreviewPool} />

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

      <div className="flex flex-wrap items-stretch gap-3">
        {renderPool('grill')}
        {renderPool('hot')}
      </div>

      <div className="flex flex-wrap items-stretch gap-3">
        {renderPool('cold')}
        {renderPool('freezer')}
      </div>

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
