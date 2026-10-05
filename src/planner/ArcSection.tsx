import { useEffect, useState } from 'react';
import type { Arc, EntityStatus, PlannerNode, Project } from '../db/queries/planner/types';
import { STATUSES } from './ProjectModal';
import { FIELD_CLASS } from './plannerStyles';

/** Done/total one-off nodes; routine occurrences are left out (there is a year of them). */
export function countNodes(nodes: readonly PlannerNode[], match: (node: PlannerNode) => boolean) {
  const mine = nodes.filter((node) => !node.isRoutine && match(node));
  return { done: mine.filter((node) => node.isCompleted).length, total: mine.length };
}

export function StatusSelect({ status, onChange }: { status: EntityStatus; onChange: (status: EntityStatus) => void }) {
  return (
    <select
      value={status}
      aria-label="Status"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value as EntityStatus)}
      className="cursor-pointer rounded-tab border border-border-subtle bg-transparent px-1.5 py-0.5 text-fg-muted outline-none hover:text-fg-prominent"
      style={{ fontSize: '0.75rem' }}
    >
      {STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function ProjectCard({ project, arc, nodes, onOpen, onStatus }: {
  project: Project; arc: Arc; nodes: readonly PlannerNode[]; onOpen: () => void; onStatus: (status: EntityStatus) => void;
}) {
  const { done, total } = countNodes(nodes, (node) => node.projectId === project.id);
  const isArchived = project.status === 'archived';
  const dates = [project.startDate, project.endDate];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => event.key === 'Enter' && onOpen()}
      className={`flex min-h-[92px] cursor-pointer flex-col gap-2 rounded-tab border border-border-subtle p-3 transition-colors duration-panel ease-panel hover:border-border-strong ${isArchived ? 'opacity-50' : ''}`}
      style={{ background: `${arc.colorHex}12` }}
    >
      <span className={`font-semibold text-fg-prominent ${project.status === 'done' ? 'line-through' : ''}`}>{project.name}</span>
      {total > 0 && (
        <div className="h-1 overflow-hidden rounded-full bg-border-subtle">
          <div className="h-full" style={{ width: `${(done / total) * 100}%`, background: arc.colorHex }} />
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 text-fg-faint" style={{ fontSize: '0.75rem' }}>
        <StatusSelect status={project.status} onChange={onStatus} />
        <span>{done}/{total} done</span>
      </div>
      {(dates[0] || dates[1]) && <span className="text-fg-faint" style={{ fontSize: '0.72rem' }}>{dates[0] ?? '?'} → {dates[1] ?? '…'}</span>}
    </div>
  );
}

function NewProjectCard({ onCreate }: { onCreate: (name: string) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');

  function commit() {
    if (name.trim()) onCreate(name.trim());
    setName('');
    setIsAdding(false);
  }

  if (!isAdding) {
    return (
      <button type="button" onClick={() => setIsAdding(true)} className="min-h-[92px] rounded-tab border border-dashed border-border-subtle text-fg-muted transition-colors duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent">
        + Project
      </button>
    );
  }
  return (
    <div className="flex min-h-[92px] items-center rounded-tab border border-dashed border-border-strong p-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setName(''); setIsAdding(false); } }}
        placeholder="Project name…"
        className={FIELD_CLASS}
      />
    </div>
  );
}

interface ArcSectionProps {
  arc: Arc;
  projects: readonly Project[];
  nodes: readonly PlannerNode[];
  onEditArc: (patch: { name?: string; description?: string }) => void;
  onArcStatus: (status: EntityStatus) => void;
  onDeleteArc: () => void;
  onAddProject: (name: string) => void;
  onOpenProject: (project: Project) => void;
  onProjectStatus: (project: Project, status: EntityStatus) => void;
}

/** One arc: editable header and description, then its projects grouped by status. */
export function ArcSection({ arc, projects, nodes, onEditArc, onArcStatus, onDeleteArc, onAddProject, onOpenProject, onProjectStatus }: ArcSectionProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(arc.name);
  const [descDraft, setDescDraft] = useState(arc.description);
  useEffect(() => setDescDraft(arc.description), [arc.id, arc.description]);

  const { done, total } = countNodes(nodes, (node) => node.arcId === arc.id);

  function commitName() {
    if (nameDraft.trim() && nameDraft.trim() !== arc.name) onEditArc({ name: nameDraft.trim() });
    setIsRenaming(false);
  }

  const grid = (list: readonly Project[], extra?: React.ReactNode) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
      {list.map((project) => (
        <ProjectCard key={project.id} project={project} arc={arc} nodes={nodes} onOpen={() => onOpenProject(project)} onStatus={(status) => onProjectStatus(project, status)} />
      ))}
      {extra}
    </div>
  );
  const section = (label: string, status: EntityStatus) => {
    const list = projects.filter((project) => project.status === status);
    return list.length > 0 && (
      <div key={status} className="flex flex-col gap-2">
        <h4 className="text-fg-muted" style={{ fontSize: '0.78rem' }}>{label}</h4>
        {grid(list)}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-tab px-3 py-2" style={{ background: `${arc.colorHex}26`, borderLeft: `3px solid ${arc.colorHex}` }}>
        {isRenaming ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setIsRenaming(false); }}
            className={`${FIELD_CLASS} max-w-[280px]`}
          />
        ) : (
          <h3 title="Double-click to rename" onDoubleClick={() => { setNameDraft(arc.name); setIsRenaming(true); }} className="cursor-text font-semibold text-fg-prominent" style={{ fontSize: '1.05rem' }}>
            {arc.name}
          </h3>
        )}
        <StatusSelect status={arc.status} onChange={onArcStatus} />
        <span className="ml-auto text-fg-muted" style={{ fontSize: '0.78rem' }}>{projects.length} projects · {done}/{total} done</span>
        <button type="button" onClick={onDeleteArc} className="text-fg-faint transition-colors duration-panel ease-panel hover:text-accent-link-broken">Delete</button>
      </div>

      <textarea
        value={descDraft}
        onChange={(e) => setDescDraft(e.target.value)}
        onBlur={() => descDraft !== arc.description && onEditArc({ description: descDraft })}
        placeholder="Arc description…"
        rows={2}
        className={`${FIELD_CLASS} resize-none border-transparent bg-transparent`}
      />

      {grid(projects.filter((project) => project.status === 'active'), <NewProjectCard onCreate={onAddProject} />)}
      {section('Archived', 'archived')}
      {section('Done', 'done')}
    </div>
  );
}
