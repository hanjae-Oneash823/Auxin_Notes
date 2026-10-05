import { useState } from 'react';
import type { ProjectPatch } from '../db/queries/planner/structure';
import type { Arc, EntityStatus, Project } from '../db/queries/planner/types';
import { FIELD_CLASS } from './plannerStyles';

export const STATUSES: readonly EntityStatus[] = ['active', 'done', 'archived'];

interface ProjectModalProps {
  project: Project;
  arcs: readonly Arc[];
  onSave: (patch: ProjectPatch) => void;
  onDelete: () => void;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-fg-muted">
      {label}
      {children}
    </label>
  );
}

/** Edit form for one project: name, description, status, arc and date range. */
export function ProjectModal({ project, arcs, onSave, onDelete, onClose }: ProjectModalProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState(project.status);
  const [arcId, setArcId] = useState(project.arcId ?? '');
  const [startDate, setStartDate] = useState(project.startDate ?? '');
  const [endDate, setEndDate] = useState(project.endDate ?? '');

  const canSave = name.trim().length > 0;

  function save() {
    if (!canSave) return;
    onSave({ name: name.trim(), description, status, arcId: arcId || null, startDate: startDate || null, endDate: endDate || null });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Edit project"
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[88vh] w-[440px] max-w-[92vw] flex-col gap-3 overflow-y-auto rounded-tab border border-border bg-bg p-4"
        style={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem' }}
      >
        <h2 className="font-semibold text-fg-prominent" style={{ fontSize: '0.95rem' }}>Edit project</h2>

        <Field label="Name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className={FIELD_CLASS} />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${FIELD_CLASS} resize-none`} />
        </Field>

        <div className="flex gap-2">
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as EntityStatus)} className={FIELD_CLASS}>
              {STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="Arc">
            <select value={arcId} onChange={(e) => setArcId(e.target.value)} className={FIELD_CLASS}>
              <option value="">No arc</option>
              {arcs.map((arc) => <option key={arc.id} value={arc.id}>{arc.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex gap-2">
          <Field label="Start">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={FIELD_CLASS} />
          </Field>
          <Field label="End">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={FIELD_CLASS} />
          </Field>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={onDelete} className="text-fg-faint transition-colors duration-panel ease-panel hover:text-accent-link-broken">Delete project</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-tab border border-border-subtle px-3 py-1.5 text-fg-muted transition-colors duration-panel ease-panel hover:text-fg-prominent">Cancel</button>
            <button type="button" disabled={!canSave} onClick={save} className="rounded-tab border border-border-strong px-3 py-1.5 text-fg-prominent transition-colors duration-panel ease-panel enabled:hover:bg-border-subtle disabled:opacity-40">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
