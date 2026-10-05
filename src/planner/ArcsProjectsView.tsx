import { useEffect, useState } from 'react';
import type { Arc, EntityStatus, Project } from '../db/queries/planner/types';
import { ArcSection, StatusSelect, countNodes } from './ArcSection';
import { ConfirmModal } from './ConfirmModal';
import { ProjectModal } from './ProjectModal';
import { usePlannerStore } from './plannerStore';
import { FIELD_CLASS } from './plannerStyles';

const ARC_PALETTE = ['#00c4a7', '#6366f1', '#f59e0b', '#e879f9', '#f87171', '#34d399', '#60a5fa', '#fb923c', '#a78bfa', '#94a3b8'] as const;

type Pane = 'arcs' | 'storage';
type Confirm =
  | { kind: 'delete-arc'; arc: Arc }
  | { kind: 'delete-project'; project: Project }
  | { kind: 'arc-status'; arc: Arc; status: EntityStatus };

const GHOST_BUTTON = 'rounded-tab border border-border-subtle px-3 py-1 text-fg-muted transition-colors duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent';

function NewArcForm({ onSave, onCancel }: { onSave: (name: string, colorHex: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState<string>(ARC_PALETTE[0]);
  const commit = () => (name.trim() ? onSave(name.trim(), colorHex) : onCancel());
  return (
    <div className="flex flex-col gap-3 rounded-tab border border-border-subtle p-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Arc name…"
        className={FIELD_CLASS}
      />
      <div className="flex items-center gap-2">
        {ARC_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Color ${color}`}
            onClick={() => setColorHex(color)}
            className="h-4 w-4 rounded-full"
            style={{ background: color, outline: colorHex === color ? `2px solid ${color}` : 'none', outlineOffset: 2 }}
          />
        ))}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancel} className={GHOST_BUTTON}>Cancel</button>
          <button type="button" onClick={commit} className={GHOST_BUTTON}>Create</button>
        </div>
      </div>
    </div>
  );
}

/** Planner tab for managing arcs and their projects, modelled on Mycelium's Projects plugin. */
export function ArcsProjectsView() {
  const { arcs, projects, nodes } = usePlannerStore();
  const { addArc, editArc, setArcStatus, removeArc, addProject, editProject, removeProject } = usePlannerStore();

  const [pane, setPane] = useState<Pane>('arcs');
  const [index, setIndex] = useState(0);
  const [isAddingArc, setIsAddingArc] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  // Biggest arcs first, like Mycelium.
  const size = (arc: Arc) => projects.filter((p) => p.arcId === arc.id).length + countNodes(nodes, (n) => n.arcId === arc.id).total;
  const sorted = [...arcs].sort((a, b) => size(b) - size(a));
  const activeArcs = sorted.filter((arc) => arc.status === 'active');
  const storedArcs = sorted.filter((arc) => arc.status !== 'active');
  const arc = activeArcs[Math.min(index, activeArcs.length - 1)] ?? null;
  const editing = projects.find((project) => project.id === editingId) ?? null;

  const step = (delta: number) => setIndex((i) => (activeArcs.length ? (i + delta + activeArcs.length) % activeArcs.length : 0));

  useEffect(() => {
    if (pane !== 'arcs') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pane, activeArcs.length]);

  /** Activating an arc is direct; archiving or finishing it also changes its projects, so that asks first. */
  const changeArcStatus = (target: Arc, status: EntityStatus) =>
    status === 'active' ? void editArc(target.id, { status }) : setConfirm({ kind: 'arc-status', arc: target, status });

  function runConfirm() {
    if (!confirm) return;
    if (confirm.kind === 'delete-arc') void removeArc(confirm.arc.id);
    else if (confirm.kind === 'delete-project') void removeProject(confirm.project.id);
    else void setArcStatus(confirm.arc.id, confirm.status);
    setConfirm(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        {(['arcs', 'storage'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setPane(id)}
            className={`rounded-tab border px-2.5 py-0.5 transition-colors duration-panel ease-panel ${pane === id ? 'border-border-strong bg-border-subtle text-fg-prominent' : 'border-border-subtle text-fg-muted hover:text-fg-prominent'}`}
          >
            {id === 'arcs' ? 'Arcs' : `Storage box${storedArcs.length ? ` (${storedArcs.length})` : ''}`}
          </button>
        ))}
        {pane === 'arcs' && <button type="button" onClick={() => setIsAddingArc(true)} className={`ml-auto ${GHOST_BUTTON}`}>+ New arc</button>}
      </div>

      {pane === 'arcs' && isAddingArc && (
        <NewArcForm onSave={(name, colorHex) => { void addArc(name, colorHex); setIsAddingArc(false); setIndex(0); }} onCancel={() => setIsAddingArc(false)} />
      )}

      {pane === 'arcs' && !arc && !isAddingArc && <p className="text-fg-faint">No active arcs — click “+ New arc” to start.</p>}

      {pane === 'arcs' && arc && (
        <>
          <div className="flex items-center justify-center gap-2">
            <button type="button" aria-label="Previous arc" onClick={() => step(-1)} className="px-2 text-fg-muted hover:text-fg-prominent">‹</button>
            {activeArcs.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-label={item.name}
                title={item.name}
                onClick={() => setIndex(i)}
                className="h-1.5 transition-all duration-panel ease-panel"
                style={{ width: item.id === arc.id ? 18 : 6, background: item.id === arc.id ? item.colorHex : 'var(--border-subtle)' }}
              />
            ))}
            <button type="button" aria-label="Next arc" onClick={() => step(1)} className="px-2 text-fg-muted hover:text-fg-prominent">›</button>
          </div>
          <ArcSection
            key={arc.id}
            arc={arc}
            projects={projects.filter((project) => project.arcId === arc.id)}
            nodes={nodes}
            onEditArc={(patch) => void editArc(arc.id, patch)}
            onArcStatus={(status) => changeArcStatus(arc, status)}
            onDeleteArc={() => setConfirm({ kind: 'delete-arc', arc })}
            onAddProject={(name) => void addProject({ name, arcId: arc.id })}
            onOpenProject={(project) => setEditingId(project.id)}
            onProjectStatus={(project, status) => void editProject(project.id, { status })}
          />
        </>
      )}

      {pane === 'storage' && (
        storedArcs.length === 0 ? <p className="text-fg-faint">The storage box is empty.</p> : (
          <div className="flex flex-col gap-1.5">
            {storedArcs.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-tab border border-border-subtle px-3 py-2" style={{ borderLeft: `3px solid ${item.colorHex}` }}>
                <span className={`min-w-0 flex-1 truncate text-fg-prominent ${item.status === 'done' ? 'line-through' : ''}`}>{item.name}</span>
                <span className="text-fg-faint" style={{ fontSize: '0.75rem' }}>
                  {projects.filter((project) => project.arcId === item.id).length}p · {countNodes(nodes, (n) => n.arcId === item.id).total}t
                </span>
                <StatusSelect status={item.status} onChange={(status) => changeArcStatus(item, status)} />
              </div>
            ))}
          </div>
        )
      )}

      {editing && (
        <ProjectModal
          key={editing.id}
          project={editing}
          arcs={arcs}
          onSave={(patch) => void editProject(editing.id, patch)}
          onDelete={() => { setEditingId(null); setConfirm({ kind: 'delete-project', project: editing }); }}
          onClose={() => setEditingId(null)}
        />
      )}

      {confirm?.kind === 'delete-arc' && (
        <ConfirmModal
          title="Delete arc"
          body={`Deleting “${confirm.arc.name}” permanently removes its projects and unassigns their planner nodes. This can't be undone.`}
          confirmLabel="Delete"
          isDanger
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'delete-project' && (
        <ConfirmModal
          title="Delete project"
          body={`Deleting “${confirm.project.name}” unassigns its planner nodes. This can't be undone.`}
          confirmLabel="Delete"
          isDanger
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'arc-status' && (
        <ConfirmModal
          title="Change arc status"
          body={`Setting “${confirm.arc.name}” to “${confirm.status}” also sets its ${projects.filter((p) => p.arcId === confirm.arc.id).length} project(s) to “${confirm.status}”.`}
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
