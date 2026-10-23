import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, type Variants } from 'framer-motion';
import type { NewNodeInput } from '../db/queries/planner/nodes';
import type { PlannerNode } from '../db/queries/planner/types';
import { PlannerCalendar } from './analytics/PlannerCalendar';
import { FinishedToday } from './analytics/FinishedToday';
import { WeekFootprint } from './analytics/WeekFootprint';
import { ArcsProjectsView } from './ArcsProjectsView';
import { SprintBox } from './SprintBox';
import type { SprintRequest } from './DashboardQuickInput';
import { NewNodeModal, type NodeDefaults } from './NewNodeModal';
import { NodeDetailPanel } from './NodeDetailPanel';
import { FieldView } from './field/FieldView';
import { RoutinesView } from './RoutinesView';
import { SessionHistory } from './SessionHistory';
import { DashboardView } from './DashboardView';
import { todayKey } from './nodeDerived';
import { PANEL_EASE } from './plannerMotion';
import { usePlannerStore } from './plannerStore';
import { useSessionStore } from './sessionStore';
import { useSmoothWheelScroll } from '../layout/useSmoothWheelScroll';

type PlannerTab = 'dashboard' | 'field' | 'routines' | 'arcs' | 'clock';
const TABS: readonly { id: PlannerTab; label: string }[] = [
  { id: 'dashboard', label: 'Tasks' },
  { id: 'routines', label: 'Routines' },
  { id: 'arcs', label: 'Arcs & projects' },
  { id: 'clock', label: 'On the clock' },
  { id: 'field', label: 'Field' },
];

/** A page enters from the side of the tab bar its tab is on and leaves toward the other. */
const SLIDE_PX = 28;
const TAB_SLIDE: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * SLIDE_PX }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: -direction * SLIDE_PX }),
};

const MIDNIGHT_CHECK_MS = 60_000;
/** Tabs with no task selection; every other tab selects cards. */
const NON_TASK_TABS: readonly PlannerTab[] = ['field', 'routines', 'arcs', 'clock'];
/** Clicks on these keep the current selection; a click anywhere else on a task tab (margins included) clears it. */
const KEEP_SELECTION_SELECTOR = '[data-task-id], [data-keep-selection], input, button, select, textarea';

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-tab border border-accent-link-broken px-3 py-2 text-accent-link-broken">
      <span className="min-w-0 flex-1">{message}</span>
      <button type="button" onClick={onDismiss} className="shrink-0 hover:text-fg-prominent">dismiss</button>
    </div>
  );
}

/** The Planner's content-area mode: Hot / Cold / Inbox pools, Field, Routines and On The Clock views over planner.sqlite. */
export function PlannerView() {
  const scrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(scrollRef);
  const { nodes, isLoaded, error: plannerError, dismissError: dismissPlannerError } = usePlannerStore();
  const { addNode, editNode, setGroups, refresh } = usePlannerStore();
  const { error: sessionError, dismissError: dismissSessionError } = useSessionStore();

  const [tab, setTab] = useState<PlannerTab>('dashboard');
  /** Which way the last tab switch went along the tab bar: 1 = to the right, -1 = to the left. */
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);

  function switchTab(next: PlannerTab) {
    setSlideDirection(TABS.findIndex((candidate) => candidate.id === next) > TABS.findIndex((candidate) => candidate.id === tab) ? 1 : -1);
    setTab(next);
  }
  /** The pinned header's row for the Tasks tab's quick-add bar, which DashboardView portals into. */
  const [sprintRequest, setSprintRequest] = useState<SprintRequest | null>(null);
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerNode | null>(null);
  const [defaults, setDefaults] = useState<NodeDefaults | undefined>(undefined);
  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  // Upcoming events and today's routine tasks are relative to the date, so reload when it rolls over.
  useEffect(() => {
    let lastDate = todayKey();
    const timer = window.setInterval(() => {
      const date = todayKey();
      if (date === lastDate) return;
      lastDate = date;
      void refresh();
    }, MIDNIGHT_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  function openForm(node: PlannerNode | null, startingValues?: NodeDefaults) {
    setEditing(node);
    setDefaults(startingValues);
    setIsModalOpen(true);
  }

  function closeForm() {
    setIsModalOpen(false);
    setEditing(null);
  }

  async function submitForm(input: NewNodeInput) {
    closeForm();
    if (!editing) return addNode(input);
    await editNode(editing.id, {
      title: input.title, nodeType: input.nodeType, plannedStartAt: input.plannedStartAt, dueAt: input.dueAt,
      estimatedDurationMinutes: input.estimatedDurationMinutes, importanceLevel: input.importanceLevel,
      arcId: input.arcId, projectId: input.projectId, sprintId: input.sprintId, pool: input.pool,
    });
    await setGroups(editing.id, input.groupIds ?? []);
  }

  const clearSelectionOnBackground = (event: React.MouseEvent) => {
    if (NON_TASK_TABS.includes(tab)) return;
    if (!(event.target as HTMLElement).closest(KEEP_SELECTION_SELECTOR)) setSelectedId(null);
  };

  const toggleSelected = (id: string) => setSelectedId((current) => (current === id ? null : id));

  /** The calendar column of the task tab (left of the pools): the calendar and 7-day history, then the selected node's details. */
  const detailColumn = (
    <div data-keep-selection className="flex min-w-[260px] flex-1 flex-col gap-4">
      {tab === 'dashboard' && <SprintBox onPick={(sprint) => setSprintRequest((current) => ({ sprint, seq: (current?.seq ?? 0) + 1 }))} />}
      <PlannerCalendar isTransparent />
      <WeekFootprint isTransparent />
      <FinishedToday isTransparent />
      <AnimatePresence mode="wait" initial={false}>
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: PANEL_EASE }}
          >
            <NodeDetailPanel node={selected} onEdit={() => openForm(selected)} onClose={() => setSelectedId(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
    <div ref={scrollRef} className="h-full overflow-y-scroll px-8 pb-6 [scrollbar-gutter:stable]" style={{ fontSize: '0.85rem' }} onClick={clearSelectionOnBackground}>
      {/* Pinned: the tabs and the quick-add row stay on screen however far the page scrolls. */}
      <div className="sticky top-0 z-30 -mx-8 bg-bg px-8 pb-5 pt-6">
        <div className="mx-auto flex max-w-[980px] flex-col gap-3">
          <nav className="flex gap-1.5">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => switchTab(id)}
                className={`rounded-tab border px-3 py-1 transition-colors duration-panel ease-panel ${
                  tab === id ? 'border-border-strong bg-border-subtle text-fg-prominent' : 'border-border-subtle text-fg-muted hover:text-fg-prominent'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div ref={setToolbarSlot} className="empty:hidden" />
        </div>
      </div>

      <div className="mx-auto flex max-w-[980px] flex-col gap-5">
        {plannerError && <ErrorBanner message={plannerError} onDismiss={dismissPlannerError} />}
        {sessionError && <ErrorBanner message={sessionError} onDismiss={dismissSessionError} />}

        <AnimatePresence mode="wait" initial={false} custom={slideDirection}>
          <motion.div
            key={isLoaded ? tab : 'loading'}
            custom={slideDirection}
            variants={TAB_SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.18, ease: PANEL_EASE }}
          >
            {!isLoaded ? (
              <p className="text-fg-faint">Loading planner…</p>
            ) : tab === 'dashboard' ? (
              <div className="flex flex-wrap items-start gap-6">
                {detailColumn}
                <div className="flex min-w-[320px] flex-[1.6] flex-col gap-5">
                  <DashboardView selectedId={selectedId} onSelect={toggleSelected} onNewNode={() => openForm(null)} toolbarSlot={toolbarSlot} sprintRequest={sprintRequest} />
                </div>
              </div>
            ) : tab === 'clock' ? (
              <SessionHistory />
            ) : tab === 'routines' ? (
              <RoutinesView />
            ) : tab === 'arcs' ? (
              <ArcsProjectsView />
            ) : (
              <FieldView onCreate={(startingValues) => openForm(null, startingValues)} onEdit={openForm} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {isModalOpen && <NewNodeModal initial={editing} defaults={defaults} onSubmit={(input) => void submitForm(input)} onClose={closeForm} />}
    </div>
    </MotionConfig>
  );
}
