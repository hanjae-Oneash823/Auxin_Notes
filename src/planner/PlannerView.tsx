import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Plus } from '@phosphor-icons/react';
import type { NewNodeInput } from '../db/queries/planner/nodes';
import type { PlannerNode, Pool } from '../db/queries/planner/types';
import { ArcsProjectsPanel } from './ArcsProjectsPanel';
import { ArcsProjectsView } from './ArcsProjectsView';
import { NewNodeModal, type NodeDefaults } from './NewNodeModal';
import { QuickAddInput } from './QuickAddInput';
import { NodeDetailPanel } from './NodeDetailPanel';
import { FieldView } from './field/FieldView';
import { RoutinesView } from './RoutinesView';
import { SessionHistory } from './SessionHistory';
import { DashboardView } from './DashboardView';
import { HotList } from './HotList';
import { PoolList } from './PoolList';
import { todayKey } from './nodeDerived';
import { PANEL_EASE } from './plannerMotion';
import { usePlannerStore } from './plannerStore';
import { useSessionStore } from './sessionStore';

/** Grill is dashboard-only, so it has no tab of its own. */
type PoolTab = Exclude<Pool, 'grill'>;
type PlannerTab = 'dashboard' | PoolTab | 'field' | 'routines' | 'arcs' | 'clock';
const TABS: readonly { id: PlannerTab; label: string }[] = [
  { id: 'dashboard', label: 'Tasks' },
  { id: 'hot', label: 'Hot' },
  { id: 'cold', label: 'Cold' },
  { id: 'freezer', label: 'Freezer' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'field', label: 'Field' },
  { id: 'routines', label: 'Routines' },
  { id: 'arcs', label: 'Arcs & projects' },
  { id: 'clock', label: 'On the clock' },
];

const MIDNIGHT_CHECK_MS = 60_000;

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
  const { nodes, isLoaded, error: plannerError, dismissError: dismissPlannerError } = usePlannerStore();
  const { addNode, editNode, setGroups, setCompleted, refresh } = usePlannerStore();
  const { error: sessionError, dismissError: dismissSessionError } = useSessionStore();

  const [tab, setTab] = useState<PlannerTab>('dashboard');
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
      arcId: input.arcId, projectId: input.projectId, pool: input.pool,
    });
    await setGroups(editing.id, input.groupIds ?? []);
  }

  const movePool = (node: PlannerNode, pool: Pool) => void editNode(node.id, { pool });

  return (
    <MotionConfig reducedMotion="user">
    <div className="h-full overflow-y-auto px-8 py-6" style={{ fontSize: '0.85rem' }}>
      <div className="mx-auto flex max-w-[980px] flex-col gap-5">
        {plannerError && <ErrorBanner message={plannerError} onDismiss={dismissPlannerError} />}
        {sessionError && <ErrorBanner message={sessionError} onDismiss={dismissSessionError} />}

        <nav className="flex gap-1.5">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-tab border px-3 py-1 transition-colors duration-panel ease-panel ${
                tab === id ? 'border-border-strong bg-border-subtle text-fg-prominent' : 'border-border-subtle text-fg-muted hover:text-fg-prominent'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {!isLoaded ? (
          <p className="text-fg-faint">Loading planner…</p>
        ) : tab === 'dashboard' ? (
          <DashboardView />
        ) : tab === 'clock' ? (
          <SessionHistory />
        ) : tab === 'routines' ? (
          <RoutinesView />
        ) : tab === 'arcs' ? (
          <ArcsProjectsView />
        ) : tab === 'field' ? (
          <FieldView onCreate={(startingValues) => openForm(null, startingValues)} onEdit={openForm} />
        ) : (
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex min-w-[320px] flex-[2] flex-col gap-5">
              <div className="flex items-center gap-2">
                <QuickAddInput onCommit={(input) => void addNode({ ...input, pool: tab })} />
                <button
                  type="button"
                  onClick={() => openForm(null, { pool: tab })}
                  className="flex shrink-0 items-center gap-1.5 rounded-tab border border-border-subtle px-3 py-2 text-fg-muted transition-colors duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent"
                >
                  <Plus size={14} />
                  New node
                </button>
              </div>

              {tab === 'hot' ? (
                <HotList
                  nodes={nodes}
                  selectedId={selectedId}
                  onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
                  onToggle={(node) => void setCompleted(node.id, !node.isCompleted)}
                  onCool={(node) => movePool(node, 'cold')}
                />
              ) : (
                <PoolList
                  nodes={nodes}
                  pool={tab}
                  selectedId={selectedId}
                  onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
                  onToggle={(node) => void setCompleted(node.id, !node.isCompleted)}
                  onMove={movePool}
                />
              )}
            </div>

            <div className="flex min-w-[260px] flex-1 flex-col gap-4">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selected ? selected.id : 'arcs'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: PANEL_EASE }}
                >
                  {selected ? (
                    <NodeDetailPanel node={selected} onEdit={() => openForm(selected)} onClose={() => setSelectedId(null)} />
                  ) : (
                    <ArcsProjectsPanel />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && <NewNodeModal initial={editing} defaults={defaults} onSubmit={(input) => void submitForm(input)} onClose={closeForm} />}
    </div>
    </MotionConfig>
  );
}
