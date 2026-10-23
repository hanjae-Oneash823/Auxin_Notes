import { useEffect, useRef, useState } from 'react';
import { Compass } from '@phosphor-icons/react';
import { AnimatePresence, Reorder, motion } from 'framer-motion';
import type { Arc, PlannerNode, Project, Sprint } from '../db/queries/planner/types';
import { fractionDone, tally } from './arcDerived';
import { GHOST_BUTTON, NewArcForm } from './NewArcForm';
import { ProgressRing } from './ProgressRing';
import { COLLAPSE, LIST_ITEM } from './plannerMotion';
import { Panel } from './Panel';
import { EntityIcon } from './plannerIcons';
import { CARD_FILL_CLASS, CARD_HOVER_FILL_CLASS } from './plannerStyles';

interface ArcListProps {
  arcs: readonly Arc[];
  projects: readonly Project[];
  sprints: readonly Sprint[];
  nodes: readonly PlannerNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, colorHex: string) => void;
  /** Saves a new hand ranking of the active arcs, first to last. */
  onReorder: (orderedIds: string[]) => void;
}

/** The overview column: one row per arc with its progress, so every arc is visible at once. Done and archived arcs sit behind a toggle. */
export function ArcList({ arcs, projects, sprints, nodes, selectedId, onSelect, onCreate, onReorder }: ArcListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isShowingStored, setIsShowingStored] = useState(false);
  const active = arcs.filter((arc) => arc.status === 'active');
  const stored = arcs.filter((arc) => arc.status !== 'active');

  /** The ranking as shown: follows the drag while it is under way, and the saved order otherwise. */
  const activeKey = active.map((arc) => arc.id).join();
  const [order, setOrder] = useState<string[]>(() => active.map((arc) => arc.id));
  useEffect(() => setOrder(activeKey ? activeKey.split(',') : []), [activeKey]);
  const shown = [...order.filter((id) => active.some((arc) => arc.id === id)), ...active.map((arc) => arc.id).filter((id) => !order.includes(id))];
  /** Releasing a drag also fires a click; that one must not open the arc. */
  const didDrag = useRef(false);

  const card = (arc: Arc) => {
    const counts = tally(nodes, (node) => node.arcId === arc.id);
    const isSelected = arc.id === selectedId;
    return (
      <button
        type="button"
        onClick={() => { if (didDrag.current) return; onSelect(arc.id); }}
        aria-pressed={isSelected}
        className={`flex w-full items-center gap-3 rounded-tab border px-3 py-2 text-left transition-colors duration-panel ease-panel ${CARD_HOVER_FILL_CLASS} ${isSelected ? `border-border-strong ${CARD_FILL_CLASS}` : 'border-border-subtle bg-bg'} ${arc.status === 'archived' ? 'opacity-50' : ''}`}
      >
        <EntityIcon icon={arc.icon} fallback={Compass} size={18} weight="bold" color={arc.colorHex} className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`truncate font-medium text-fg-prominent ${arc.status === 'done' ? 'line-through' : ''}`}>{arc.name}</span>
          <span className="truncate text-fg-faint" style={{ fontSize: '0.72rem' }}>
            {projects.filter((project) => project.arcId === arc.id && project.status === 'active').length} projects
            {' · '}{sprints.filter((sprint) => sprint.arcId === arc.id && sprint.status === 'active').length} sprints
          </span>
          <span className="truncate text-fg-faint" style={{ fontSize: '0.72rem' }}>{counts.open} open · {counts.done} done</span>
        </div>
        <ProgressRing fraction={fractionDone(counts)} color={arc.colorHex} label={`${arc.name} progress`} value={counts.done} max={counts.total} />
      </button>
    );
  };
  const storedRow = (arc: Arc) => <motion.div key={arc.id} {...LIST_ITEM}>{card(arc)}</motion.div>;

  return (
    <Panel title="Arcs" count={active.length} actions={<button type="button" onClick={() => setIsAdding(true)} className={GHOST_BUTTON}>+ New arc</button>}>
      <AnimatePresence initial={false}>
        {isAdding && <motion.div key="new-arc" {...COLLAPSE}><NewArcForm onSave={(name, colorHex) => { onCreate(name, colorHex); setIsAdding(false); }} onCancel={() => setIsAdding(false)} /></motion.div>}
      </AnimatePresence>
      {active.length === 0 && !isAdding && <p className="px-1 py-3 text-fg-faint">No active arcs. Start one for a long-running area of your life.</p>}
      <Reorder.Group as="div" axis="y" values={shown} onReorder={setOrder} className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {shown.map((id) => {
            const arc = active.find((candidate) => candidate.id === id);
            if (!arc) return null;
            return (
              <Reorder.Item
                as="div"
                key={arc.id}
                value={arc.id}
                initial={LIST_ITEM.initial}
                animate={LIST_ITEM.animate}
                exit={LIST_ITEM.exit}
                whileDrag={{ scale: 1.02, cursor: 'grabbing' }}
                onDragStart={() => { didDrag.current = true; }}
                onDragEnd={() => {
                  if (shown.join() !== activeKey) onReorder(shown);
                  window.setTimeout(() => { didDrag.current = false; }, 0);
                }}
                className="cursor-grab"
              >
                {card(arc)}
              </Reorder.Item>
            );
          })}
        </AnimatePresence>
      </Reorder.Group>
      {stored.length > 0 && (
        <>
          <button type="button" onClick={() => setIsShowingStored((shown) => !shown)} className="self-start px-1 pt-1 text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent" style={{ fontSize: '0.75rem' }}>
            {isShowingStored ? 'Hide' : 'Show'} done &amp; archived ({stored.length})
          </button>
          <AnimatePresence initial={false}>{isShowingStored && stored.map(storedRow)}</AnimatePresence>
        </>
      )}
    </Panel>
  );
}
