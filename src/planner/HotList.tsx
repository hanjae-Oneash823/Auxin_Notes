import { AnimatePresence } from 'framer-motion';
import type { PlannerNode } from '../db/queries/planner/types';
import { NodeRow } from './NodeRow';
import { SectionLabel } from './SectionLabel';
import { bucketNodes } from './hotLogic';

interface HotListProps {
  nodes: readonly PlannerNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (node: PlannerNode) => void;
  /** Move a task down to the cold pool. */
  onCool: (node: PlannerNode) => void;
}

/** The dashboard: upcoming Events, the Hot pool, and what's Done today. */
export function HotList({ nodes, selectedId, onSelect, onToggle, onCool }: HotListProps) {
  const { events, hot, done } = bucketNodes(nodes);
  const rowProps = (node: PlannerNode) => ({
    node,
    isSelected: node.id === selectedId,
    onSelect: () => onSelect(node.id),
    onToggle: () => onToggle(node),
  });

  return (
    <div className="flex flex-col gap-5">
      {events.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <SectionLabel label="Events" count={events.length} />
          <AnimatePresence initial={false}>{events.map((node) => <NodeRow key={node.id} {...rowProps(node)} />)}</AnimatePresence>
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <SectionLabel label="Hot" count={hot.length} />
        {hot.length === 0 && <p className="px-1 py-3 text-fg-faint">Nothing hot. Heat something up from Cold or Inbox.</p>}
        <AnimatePresence initial={false}>
          {hot.map((node) => (
            <NodeRow
              key={node.id}
              {...rowProps(node)}
              actions={node.isRoutine ? [] : [{ label: 'cool ↓', leaves: 'right', onClick: () => onCool(node) }]}
            />
          ))}
        </AnimatePresence>
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <SectionLabel label="Done" count={done.length} />
          <AnimatePresence initial={false}>{done.map((node) => <NodeRow key={node.id} {...rowProps(node)} />)}</AnimatePresence>
        </section>
      )}
    </div>
  );
}
