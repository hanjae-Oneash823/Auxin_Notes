import { useEffect, useState } from 'react';
import type { PlannerNode } from '../db/queries/planner/types';
import { KIND_COLORS, formatMinutes, kindOf, nodeColor, summarize } from './nodeDerived';
import { usePlannerStore } from './plannerStore';

interface NodeDetailPanelProps {
  node: PlannerNode;
  onEdit: () => void;
  onClose: () => void;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-fg-faint" style={{ fontSize: '0.7rem' }}>{label}</span>
      {children}
    </div>
  );
}

/** Detail view for one node: hierarchy, times, groups, subtasks and
 *  dependencies (Mycelium's TaskDetailPanel), plus edit / complete / delete. */
export function NodeDetailPanel({ node, onEdit, onClose }: NodeDetailPanelProps) {
  const { arcs, projects, groups, nodes, edges, subTasks } = usePlannerStore();
  const { loadSubTasks, addSubTask, toggleSubTask, setCompleted, removeNode } = usePlannerStore();
  const [draft, setDraft] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    void loadSubTasks(node.id);
    setIsConfirmingDelete(false);
  }, [node.id, loadSubTasks]);

  const kind = kindOf(node);
  const arc = arcs.find((candidate) => candidate.id === node.arcId);
  const project = projects.find((candidate) => candidate.id === node.projectId);
  const nodeGroups = groups.filter((group) => !group.isUngrouped && node.groupIds.includes(group.id));
  const blockers = edges
    .filter((edge) => edge.targetId === node.id)
    .flatMap((edge) => nodes.filter((candidate) => candidate.id === edge.sourceId));
  const list = subTasks[node.id] ?? [];
  const doneCount = list.filter((sub) => sub.isCompleted).length;

  function submitSubTask() {
    const title = draft.trim();
    if (!title) return;
    void addSubTask(node.id, title);
    setDraft('');
  }

  return (
    <aside className="flex flex-col gap-3.5 rounded-tab border border-border-subtle p-3.5">
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: nodeColor(node, arcs) }} />
        <h3 className="min-w-0 flex-1 font-semibold text-fg-prominent" style={{ fontSize: '0.95rem' }}>{node.title}</h3>
        <button type="button" aria-label="close details" onClick={onClose} className="text-fg-faint hover:text-fg-prominent">×</button>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1" style={{ fontSize: '0.75rem' }}>
        <span className="capitalize" style={{ color: KIND_COLORS[kind] }}>{kind}</span>
        {node.isRoutine && <span className="text-fg-faint">routine</span>}
        {node.importanceLevel === 1 && <span className="text-accent-warning">★ important</span>}
        {arc && <span style={{ color: arc.colorHex }}>{arc.name}</span>}
        {project && <span className="text-fg-muted">/ {project.name}</span>}
      </div>

      <Section label="Schedule">
        <span className="text-fg-prominent">{node.plannedStartAt ? `${node.plannedStartAt.slice(0, 10)} · ${summarize(node) || 'any time'}` : summarize(node) || 'Unscheduled'}</span>
        {node.estimatedDurationMinutes && <span className="text-fg-faint" style={{ fontSize: '0.72rem' }}>estimate {formatMinutes(node.estimatedDurationMinutes)}</span>}
      </Section>

      {nodeGroups.length > 0 && (
        <Section label="Groups">
          <div className="flex flex-wrap gap-1.5">
            {nodeGroups.map((group) => (
              <span key={group.id} className="flex items-center gap-1.5 rounded-tab border border-border-subtle px-2 py-0.5 text-fg-muted" style={{ fontSize: '0.75rem' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: group.colorHex }} />
                {group.name}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section label={list.length > 0 ? `Subtasks · ${doneCount}/${list.length}` : 'Subtasks'}>
        {list.map((sub) => (
          <button key={sub.id} type="button" onClick={() => void toggleSubTask(node.id, sub.id, !sub.isCompleted)} className="flex items-center gap-2 text-left hover:text-fg-prominent">
            <span className="w-3 text-fg-faint">{sub.isCompleted ? '☑' : '☐'}</span>
            <span className={sub.isCompleted ? 'text-fg-faint line-through' : 'text-fg-muted'}>{sub.title}</span>
          </button>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && submitSubTask()}
          placeholder="Add a subtask — press Enter"
          className="rounded-tab border border-border-subtle bg-bg-packet px-2 py-1 text-fg-prominent outline-none placeholder:text-fg-faint focus:border-border-strong"
        />
      </Section>

      {blockers.length > 0 && (
        <Section label="Blocked by">
          {blockers.map((blocker) => <span key={blocker.id} className="text-fg-muted">→ {blocker.title}</span>)}
        </Section>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void setCompleted(node.id, !node.isCompleted)}
          className="flex-1 rounded-tab border border-border-strong px-3 py-1.5 text-fg-prominent transition-colors duration-panel ease-panel hover:bg-border-subtle"
        >
          {node.isCompleted ? 'Mark not done' : 'Mark done'}
        </button>
        <button type="button" onClick={onEdit} className="rounded-tab border border-border-subtle px-3 py-1.5 text-fg-muted transition-colors duration-panel ease-panel hover:text-fg-prominent">Edit</button>
        <button
          type="button"
          onClick={() => {
            if (!isConfirmingDelete) return setIsConfirmingDelete(true);
            void removeNode(node.id);
            onClose();
          }}
          onMouseLeave={() => setIsConfirmingDelete(false)}
          className={`rounded-tab border px-3 py-1.5 transition-colors duration-panel ease-panel ${isConfirmingDelete ? 'border-accent-link-broken text-accent-link-broken' : 'border-border-subtle text-fg-faint hover:text-fg-muted'}`}
        >
          {isConfirmingDelete ? 'Confirm?' : 'Delete'}
        </button>
      </div>
    </aside>
  );
}
