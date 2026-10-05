import { useEffect, useState } from 'react';
import type { NewNodeInput } from '../db/queries/planner/nodes';
import type { PlannerNode, Pool } from '../db/queries/planner/types';
import { KIND_COLORS, NODE_KINDS, kindOf, plannedDateOf, plannedTimeOf, todayKey, type NodeKind } from './nodeDerived';
import { usePlannerStore } from './plannerStore';
import { FIELD_CLASS } from './plannerStyles';

/** Starting values for a new node, e.g. from the field view cell that was clicked. */
export interface NodeDefaults {
  plannedDate?: string;
  pool?: Pool;
  isImportant?: boolean;
  kind?: NodeKind;
}

interface NewNodeModalProps {
  /** The node being edited; null creates a new one. */
  initial: PlannerNode | null;
  /** Starting values when creating (ignored when editing). */
  defaults?: NodeDefaults;
  onSubmit: (input: NewNodeInput) => void;
  onClose: () => void;
}

const POOLS: readonly { id: Pool; label: string }[] = [
  { id: 'grill', label: 'Grill' },
  { id: 'hot', label: 'Hot' },
  { id: 'cold', label: 'Cold' },
  { id: 'freezer', label: 'Freezer' },
  { id: 'inbox', label: 'Inbox' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-fg-muted">
      {label}
      {children}
    </label>
  );
}

/** New-node / edit-node form covering every stored node field. */
export function NewNodeModal({ initial, defaults, onSubmit, onClose }: NewNodeModalProps) {
  const arcs = usePlannerStore((state) => state.arcs).filter((arc) => arc.status === 'active' || arc.id === initial?.arcId);
  const allProjects = usePlannerStore((state) => state.projects).filter((p) => p.status === 'active' || p.id === initial?.projectId);
  const groups = usePlannerStore((state) => state.groups).filter((group) => !group.isUngrouped);

  const [kind, setKind] = useState<NodeKind>(initial ? kindOf(initial) : defaults?.kind ?? 'task');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [plannedDate, setPlannedDate] = useState(initial ? plannedDateOf(initial) ?? '' : defaults?.plannedDate ?? todayKey());
  const [plannedTime, setPlannedTime] = useState(initial ? plannedTimeOf(initial) ?? '' : '');
  const [pool, setPool] = useState<Pool>(initial?.pool ?? defaults?.pool ?? 'hot');
  const [dueDate, setDueDate] = useState(initial?.dueAt ?? '');
  const [estimate, setEstimate] = useState(initial?.estimatedDurationMinutes?.toString() ?? '');
  const [isImportant, setIsImportant] = useState(initial ? initial.importanceLevel === 1 : defaults?.isImportant ?? false);
  const [arcId, setArcId] = useState(initial?.arcId ?? '');
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [groupIds, setGroupIds] = useState<readonly string[]>(initial?.groupIds.filter((id) => groups.some((g) => g.id === id)) ?? []);
  const [subTaskTitles, setSubTaskTitles] = useState<readonly string[]>([]);
  const [subDraft, setSubDraft] = useState('');

  const isEvent = kind === 'event';
  const isAssignment = kind === 'assignment';
  /** Only events and routine occurrences have a date; a task's "when" is its pool. */
  const hasSchedule = isEvent || initial?.isRoutine === true;
  const canSave = title.trim() !== '' && (!isAssignment || dueDate !== '') && (!isEvent || plannedTime !== '');
  const projects = allProjects.filter((project) => !arcId || project.arcId === arcId);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function pickArc(id: string) {
    setArcId(id);
    if (projectId && allProjects.find((p) => p.id === projectId)?.arcId !== id) setProjectId('');
  }

  function pickProject(id: string) {
    setProjectId(id);
    const project = allProjects.find((p) => p.id === id);
    if (project?.arcId) setArcId(project.arcId);
  }

  function addSubTask() {
    const text = subDraft.trim();
    if (!text) return;
    setSubTaskTitles((current) => [...current, text]);
    setSubDraft('');
  }

  function submit() {
    if (!canSave) return;
    const minutes = Number.parseInt(estimate, 10);
    const date = plannedDate || (plannedTime ? todayKey() : '');
    onSubmit({
      title: title.trim(),
      nodeType: isEvent ? 'event' : 'task',
      pool,
      plannedStartAt: hasSchedule && date ? (plannedTime ? `${date}T${plannedTime}:00` : date) : null,
      dueAt: isAssignment ? dueDate : null,
      estimatedDurationMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
      importanceLevel: isImportant ? 1 : 0,
      arcId: arcId || null,
      projectId: projectId || null,
      groupIds,
      subTaskTitles,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={initial ? 'Edit node' : 'New node'}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[88vh] w-[440px] max-w-[92vw] flex-col gap-3 overflow-y-auto rounded-tab border border-border bg-bg p-4"
        style={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem' }}
      >
        <h2 className="font-semibold text-fg-prominent" style={{ fontSize: '0.95rem' }}>{initial ? 'Edit node' : 'New node'}</h2>

        <div className="flex gap-1.5">
          {NODE_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-tab border px-2 py-1.5 capitalize transition-colors duration-panel ease-panel ${
                option === kind ? 'border-border-strong bg-border-subtle text-fg-prominent' : 'border-border-subtle text-fg-muted hover:text-fg-prominent'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLORS[option] }} />
              {option}
            </button>
          ))}
        </div>

        <Field label="Title">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="What needs doing?" className={FIELD_CLASS} />
        </Field>

        {hasSchedule ? (
          <div className="flex gap-2">
            <Field label="Date">
              <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className={FIELD_CLASS} />
            </Field>
            <Field label={isEvent ? 'Start time' : 'Time (optional)'}>
              <input type="time" value={plannedTime} onChange={(e) => setPlannedTime(e.target.value)} className={FIELD_CLASS} />
            </Field>
          </div>
        ) : (
          <Field label="Pool">
            <select value={pool} onChange={(e) => setPool(e.target.value as Pool)} className={FIELD_CLASS}>
              {POOLS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </Field>
        )}

        <div className="flex gap-2">
          {isAssignment && (
            <Field label="Due date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD_CLASS} />
            </Field>
          )}
          <Field label={isEvent ? 'Duration (min)' : 'Estimate (min)'}>
            <input type="number" min={1} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="60" className={FIELD_CLASS} />
          </Field>
        </div>

        <div className="flex gap-2">
          <Field label="Arc">
            <select value={arcId} onChange={(e) => pickArc(e.target.value)} className={FIELD_CLASS}>
              <option value="">No arc</option>
              {arcs.map((arc) => <option key={arc.id} value={arc.id}>{arc.name}</option>)}
            </select>
          </Field>
          <Field label="Project">
            <select value={projectId} onChange={(e) => pickProject(e.target.value)} className={FIELD_CLASS}>
              <option value="">No project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </Field>
        </div>

        {groups.length > 0 && (
          <div className="flex flex-col gap-1 text-fg-muted">
            Groups
            <div className="flex flex-wrap gap-1.5">
              {groups.map((group) => {
                const isOn = groupIds.includes(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setGroupIds((current) => (isOn ? current.filter((id) => id !== group.id) : [...current, group.id]))}
                    className={`flex items-center gap-1.5 rounded-tab border px-2 py-0.5 transition-colors duration-panel ease-panel ${
                      isOn ? 'border-border-strong bg-border-subtle text-fg-prominent' : 'border-border-subtle text-fg-muted hover:text-fg-prominent'
                    }`}
                    style={{ fontSize: '0.78rem' }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: group.colorHex }} />
                    {group.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsImportant((value) => !value)}
          className={`flex items-center gap-2 self-start rounded-tab border px-2.5 py-1 transition-colors duration-panel ease-panel ${
            isImportant ? 'border-accent-warning text-accent-warning' : 'border-border-subtle text-fg-muted hover:text-fg-prominent'
          }`}
        >
          {isImportant ? '★ Important' : '☆ Mark important'}
        </button>

        {!initial && (
          <div className="flex flex-col gap-1.5 text-fg-muted">
            Subtasks
            {subTaskTitles.map((text, index) => (
              <div key={`${text}-${index}`} className="flex items-center gap-2 text-fg-prominent">
                <span className="min-w-0 flex-1 truncate">• {text}</span>
                <button type="button" aria-label="remove subtask" onClick={() => setSubTaskTitles((current) => current.filter((_, i) => i !== index))} className="text-fg-faint hover:text-fg-prominent">×</button>
              </div>
            ))}
            <input value={subDraft} onChange={(e) => setSubDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubTask())} placeholder="Add a subtask — press Enter" className={FIELD_CLASS} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-tab border border-border-subtle px-3 py-1.5 text-fg-muted transition-colors duration-panel ease-panel hover:text-fg-prominent">Cancel</button>
          <button type="button" disabled={!canSave} onClick={submit} className="rounded-tab border border-border-strong px-3 py-1.5 text-fg-prominent transition-colors duration-panel ease-panel enabled:hover:bg-border-subtle disabled:opacity-40">{initial ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
