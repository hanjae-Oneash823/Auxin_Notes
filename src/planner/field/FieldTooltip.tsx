import { createPortal } from 'react-dom';
import type { PlannerNode } from '../../db/queries/planner/types';
import { summarize } from '../nodeDerived';

interface FieldTooltipProps {
  node: PlannerNode;
  /** Viewport position of the dot the tooltip points at. */
  anchorX: number;
  anchorY: number;
}

const WIDTH_PX = 240;
const EDGE_PX = 8;
const GAP_PX = 14;

/** The hover card above a dot: its title, then time / due date and subtask progress. */
export function FieldTooltip({ node, anchorX, anchorY }: FieldTooltipProps) {
  const meta = [summarize(node), node.subTotal > 0 ? `${node.subDone}/${node.subTotal} sub` : ''].filter(Boolean).join('  ·  ');
  const left = Math.max(EDGE_PX, Math.min(anchorX - WIDTH_PX / 2, window.innerWidth - WIDTH_PX - EDGE_PX));
  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] rounded-tab border border-border bg-bg px-2.5 py-1.5"
      style={{ left, top: anchorY - GAP_PX, width: WIDTH_PX, transform: 'translateY(-100%)', boxShadow: 'var(--shadow-float)', fontSize: '0.8rem' }}
    >
      <div className="truncate text-fg-prominent">{node.title}</div>
      {meta && <div className="mt-0.5 text-fg-faint" style={{ fontSize: '0.72rem' }}>{meta}</div>}
    </div>,
    document.body,
  );
}
