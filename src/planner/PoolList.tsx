import { AnimatePresence } from 'framer-motion';
import type { PlannerNode, Pool } from '../db/queries/planner/types';
import { NodeRow, type RowAction } from './NodeRow';
import { poolNodes } from './hotLogic';

interface PoolListProps {
  nodes: readonly PlannerNode[];
  /** Cold, freezer or inbox: the hot pool is the dashboard (HotList). */
  pool: Exclude<Pool, 'hot' | 'grill'>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (node: PlannerNode) => void;
  onMove: (node: PlannerNode, pool: Pool) => void;
}

const EMPTY_TEXT: Record<Exclude<Pool, 'hot' | 'grill'>, string> = {
  cold: 'Nothing on ice. Someday tasks live here.',
  inbox: 'Inbox is empty. Capture now, sort later.',
  freezer: 'Nothing in the freezer. Super long-term ideas live here.',
};

/** A flat list of one pool's tasks, each with a button that moves it to another pool. */
export function PoolList({ nodes, pool, selectedId, onSelect, onToggle, onMove }: PoolListProps) {
  const items = poolNodes(nodes, pool);
  const actionsFor = (node: PlannerNode): RowAction[] => [
    ...(pool === 'freezer' ? [{ label: 'thaw ↑', leaves: 'left' as const, onClick: () => onMove(node, 'cold') }] : []),
    { label: 'heat ↑', leaves: 'left', onClick: () => onMove(node, 'hot') },
    ...(pool === 'inbox' ? [{ label: 'cool ↓', leaves: 'right' as const, onClick: () => onMove(node, 'cold') }] : []),
    ...(pool === 'cold' ? [{ label: 'freeze ↓', leaves: 'right' as const, onClick: () => onMove(node, 'freezer') }] : []),
  ];

  return (
    <div className="flex flex-col gap-1.5">
      {items.length === 0 && <p className="px-1 py-3 text-fg-faint">{EMPTY_TEXT[pool]}</p>}
      <AnimatePresence initial={false}>
        {items.map((node) => (
          <NodeRow
            key={node.id}
            node={node}
            isSelected={node.id === selectedId}
            onSelect={() => onSelect(node.id)}
            onToggle={() => onToggle(node)}
            actions={actionsFor(node)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
