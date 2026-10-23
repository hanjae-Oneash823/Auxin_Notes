import { useMemo } from 'react';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { SidebarPacket } from '../../layout/SidebarPacket';
import type { PlannerNode } from '../../db/queries/planner/types';
import { bucketNodes } from '../hotLogic';
import { nodeColor } from '../nodeDerived';
import { usePlannerStore } from '../plannerStore';

const pad = (n: number) => String(n).padStart(2, '0');

function finishedTime(node: PlannerNode): string {
  const at = new Date(node.actualCompletedAt ?? '');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** Where un-finishing puts the node: a task returns to its own pool; events and routine tasks to the day's list. */
function undoTitle(node: PlannerNode): string {
  return node.nodeType === 'task' && !node.isRoutine ? `Undo — back to ${node.pool}` : 'Undo — reopen';
}

/** What was finished today, tasks and events, latest first. Undo reopens a node; it returns to the pool it was finished from. */
export function FinishedToday({ isTransparent = false }: { isTransparent?: boolean }) {
  const nodes = usePlannerStore((state) => state.nodes);
  const arcs = usePlannerStore((state) => state.arcs);
  const setCompleted = usePlannerStore((state) => state.setCompleted);
  const finished = useMemo(
    () => [...bucketNodes(nodes).done].sort((a, b) => (b.actualCompletedAt ?? '').localeCompare(a.actualCompletedAt ?? '')),
    [nodes],
  );

  return (
    <SidebarPacket title={`Finished today${finished.length > 0 ? ` · ${finished.length}` : ''}`} isTransparent={isTransparent}>
      {finished.length === 0 ? (
        <p className="px-1.5 py-1 text-fg-faint" style={{ fontSize: '0.78rem' }}>Nothing finished yet today.</p>
      ) : (
        <ul className="flex flex-col">
          {finished.map((node) => (
            <li key={node.id} className="group flex items-center gap-2 rounded-tab px-1.5 py-1 transition-colors duration-panel ease-panel hover:bg-border-subtle">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: nodeColor(node, arcs) }} />
              <span className="min-w-0 flex-1 truncate text-fg-faint line-through" style={{ fontSize: '0.8rem' }}>{node.title}</span>
              {node.nodeType === 'event' && <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.66rem' }}>event</span>}
              <span className="shrink-0 tabular-nums text-fg-faint" style={{ fontSize: '0.7rem' }}>{finishedTime(node)}</span>
              <button
                type="button"
                title={undoTitle(node)}
                aria-label={`Undo finishing ${node.title}`}
                onClick={() => void setCompleted(node.id, false)}
                className="flex shrink-0 items-center p-0.5 text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
              >
                <ArrowCounterClockwise size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SidebarPacket>
  );
}
