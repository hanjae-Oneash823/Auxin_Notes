import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Play } from '@phosphor-icons/react';
import type { PlannerNode } from '../db/queries/planner/types';
import { nodeColor, summarize } from './nodeDerived';
import { COLLAPSE, PANEL_TRANSITION, POP_IN } from './plannerMotion';
import { usePlannerStore } from './plannerStore';
import { PROJECT_COLOR } from './quickAddMentions';
import { selectActiveSession, useSessionStore } from './sessionStore';
import type { Badge } from './hotLogic';

export interface RowAction {
  label: string;
  onClick: () => void;
  /** The row slides out this way and collapses before `onClick` runs — for actions that move it out of the list. */
  leaves?: 'left' | 'right';
}

const LEAVE_SLIDE_PX = 56;
const LEAVE_SLIDE_S = 0.2;
const LEAVE_COLLAPSE_S = 0.16;
/** The list's gap, which the collapsing row also takes back. */
const LIST_GAP_PX = 6;
/** If the row is still here this long after leaving (the move failed), it comes back. */
const LEAVE_RESTORE_MS = 1500;

interface NodeRowProps {
  node: PlannerNode;
  badge?: Badge;
  actions?: readonly RowAction[];
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

/** One node in the Hot / pool lists (Mycelium's TaskRow / MiniCard): arc-colored
 *  check dot, [EVENT] tag for events, a status badge and quick actions. */
export function NodeRow({ node, badge, actions = [], isSelected, onSelect, onToggle }: NodeRowProps) {
  const arcs = usePlannerStore((state) => state.arcs);
  const projects = usePlannerStore((state) => state.projects);
  const groups = usePlannerStore((state) => state.groups);
  const color = nodeColor(node, arcs);
  const sessions = useSessionStore((state) => state.sessions);
  const sessionNodes = useSessionStore((state) => state.sessionNodes);
  const doNow = useSessionStore((state) => state.doNow);
  const active = selectActiveSession({ sessions });
  const isDoing = active !== null && sessionNodes.some((entry) => entry.sessionId === active.id && entry.nodeId === node.id && entry.status === 'in_progress');
  /** A session works on one node at a time, so while any node is in progress nothing else can be started. */
  const isSessionBusy = active !== null && sessionNodes.some((entry) => entry.sessionId === active.id && entry.status === 'in_progress');
  const isEvent = node.nodeType === 'event';
  const tags = [
    ...arcs.filter((arc) => arc.id === node.arcId).map((arc) => ({ key: arc.id, label: arc.name, color: arc.colorHex })),
    ...projects.filter((project) => project.id === node.projectId).map((project) => ({ key: project.id, label: project.name, color: PROJECT_COLOR })),
    ...groups.filter((group) => !group.isUngrouped && node.groupIds.includes(group.id)).map((group) => ({ key: group.id, label: group.name, color: group.colorHex })),
  ];
  const [leaving, setLeaving] = useState<RowAction | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), LEAVE_RESTORE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  function runAction(action: RowAction) {
    if (!action.leaves || shouldReduceMotion) action.onClick();
    else setLeaving(action);
  }

  const slide = leaving?.leaves === 'left' ? -LEAVE_SLIDE_PX : LEAVE_SLIDE_PX;

  return (
    <motion.div
      layout="position"
      initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }}
      animate={leaving ? { x: slide, opacity: 0, height: 0, marginTop: -LIST_GAP_PX } : { x: 0, opacity: 1, height: 'auto', marginTop: 0 }}
      transition={
        leaving
          ? { x: { duration: LEAVE_SLIDE_S, ease: 'easeIn' }, opacity: { duration: LEAVE_SLIDE_S }, height: { duration: LEAVE_COLLAPSE_S, delay: LEAVE_SLIDE_S * 0.8 }, marginTop: { duration: LEAVE_COLLAPSE_S, delay: LEAVE_SLIDE_S * 0.8 } }
          : { ...PANEL_TRANSITION, layout: PANEL_TRANSITION }
      }
      exit={{ opacity: 0, height: 0, marginTop: -LIST_GAP_PX, transition: PANEL_TRANSITION }}
      onAnimationComplete={() => leaving && leaving.onClick()}
      style={{ overflow: leaving ? 'hidden' : undefined }}
    >
    <div
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-3 rounded-tab border px-3 py-2 transition-colors duration-panel ease-panel ${
        isEvent ? 'bg-[rgba(34,22,56,0.75)] hover:bg-[rgba(46,30,76,0.85)]' : 'hover:bg-border-subtle'
      } ${
        isSelected ? `border-border-strong ${isEvent ? 'bg-[rgba(46,30,76,0.85)]' : 'bg-border-subtle'}` : 'border-border-subtle'
      }`}
    >
      <button
        type="button"
        aria-label={node.isCompleted ? 'mark not done' : 'mark done'}
        onClick={(event) => { event.stopPropagation(); onToggle(); }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-panel ease-panel"
        style={{ borderColor: color, background: node.isCompleted ? color : 'transparent' }}
      >
        <AnimatePresence initial={false}>
          {node.isCompleted && <motion.span key="check" {...POP_IN} exit={{ opacity: 0, scale: 0.4 }} className="flex"><Check size={10} weight="bold" color="#000" /></motion.span>}
        </AnimatePresence>
      </button>


      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`truncate transition-colors duration-panel ease-panel ${node.isCompleted ? 'text-fg-faint line-through' : 'text-fg-prominent'}`}>
          {isEvent && <span className="mr-1.5 text-fg-faint" style={{ fontSize: '0.68rem' }}>[EVENT]</span>}
          {node.importanceLevel === 1 && <span className="mr-1 text-accent-warning">★</span>}
          {node.title}
        </span>
        {/* Finished rows drop the tag line (single-line), folding it away when a node is completed. */}
        <AnimatePresence initial={false}>
          {!node.isCompleted && (
            <motion.div key="tags" {...COLLAPSE} className="flex min-w-0 items-center gap-2 whitespace-nowrap" style={{ ...COLLAPSE.style, fontSize: '0.68rem', minHeight: '1em' }}>
              {tags.length === 0
                ? <span className="text-fg-faint">no arc</span>
                : tags.map((tag) => <span key={tag.key} className="shrink-0" style={{ color: tag.color }}>{tag.label}</span>)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {badge?.label && <span className="shrink-0" style={{ fontSize: '0.72rem', color: badge.color }}>{badge.label}</span>}
      <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.72rem' }}>{summarize(node)}</span>

      <AnimatePresence initial={false}>
        {isDoing && (
          <motion.span key="doing" {...POP_IN} exit={{ opacity: 0, scale: 0.4 }} className="shrink-0" style={{ fontSize: '0.72rem', color: 'var(--accent-status-dot)' }}>
            ● doing
          </motion.span>
        )}
      </AnimatePresence>
      {active && !isSessionBusy && !node.isCompleted && !isEvent && (
        <button
          type="button"
          title="add to the live session and start it"
          onClick={(event) => { event.stopPropagation(); void doNow(node.id); }}
          className="flex shrink-0 items-center gap-1 rounded-tab border border-border-subtle px-2 py-0.5 text-fg-muted opacity-0 transition-all duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent group-hover:opacity-100"
          style={{ fontSize: '0.7rem' }}
        >
          <Play size={10} weight="fill" style={{ color: 'var(--accent-status-dot)' }} />
          Do now
        </button>
      )}

      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={(event) => { event.stopPropagation(); runAction(action); }}
          className="shrink-0 rounded-tab border border-border-subtle px-2 py-0.5 text-fg-muted transition-colors duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent"
          style={{ fontSize: '0.7rem' }}
        >
          {action.label}
        </button>
      ))}
    </div>
    </motion.div>
  );
}
