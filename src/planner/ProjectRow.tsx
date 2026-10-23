import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CaretRight, Folder } from '@phosphor-icons/react';
import type { Arc, PlannerNode, Project } from '../db/queries/planner/types';
import type { ProjectPatch } from '../db/queries/planner/structure';
import { fractionDone, tally } from './arcDerived';
import { COLLAPSE } from './plannerMotion';
import { IconPicker } from './IconPicker';
import { EntityIcon } from './plannerIcons';
import { ProgressRing } from './ProgressRing';
import { StatusSelect } from './StatusSelect';
import { CARD_FILL_CLASS, CARD_HOVER_FILL_CLASS, FIELD_CLASS } from './plannerStyles';

interface ProjectRowProps {
  project: Project;
  arc: Arc;
  nodes: readonly PlannerNode[];
  onEdit: (patch: ProjectPatch) => void;
  onDelete: () => void;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-1 flex-col gap-1 text-fg-muted" style={{ fontSize: '0.75rem' }}>{label}{children}</label>;
}

/** One project: a summary line that expands in place into its full edit form, so no modal is needed. */
export function ProjectRow({ project, arc, nodes, onEdit, onDelete }: ProjectRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const counts = tally(nodes, (node) => node.projectId === project.id);
  const isDimmed = project.status !== 'active';

  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed) setName(project.name);
    else if (trimmed !== project.name) onEdit({ name: trimmed });
  };

  return (
    <div className={`flex flex-col rounded-tab border transition-colors duration-panel ease-panel ${isOpen ? `border-border-strong ${CARD_FILL_CLASS}` : `border-border-subtle bg-bg ${CARD_HOVER_FILL_CLASS}`} ${isDimmed ? 'opacity-60' : ''}`}>
      <button type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} className="flex items-center gap-3 px-3 py-2 text-left">
        <CaretRight size={11} className={`shrink-0 text-fg-faint transition-transform duration-panel ease-panel ${isOpen ? 'rotate-90' : ''}`} />
        <EntityIcon icon={project.icon} fallback={Folder} size={16} weight="bold" color={arc.colorHex} className="shrink-0" />
        <span className={`min-w-0 flex-1 truncate text-fg-prominent ${project.status === 'done' ? 'line-through' : ''}`}>{project.name}</span>
        <span className="w-12 shrink-0 text-right text-fg-faint tabular-nums" style={{ fontSize: '0.75rem' }}>{counts.done}/{counts.total}</span>
        <ProgressRing fraction={fractionDone(counts)} color={arc.colorHex} label={`${project.name} progress`} value={counts.done} max={counts.total} size={22} stroke={2.5} />
      </button>

      <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div key="form" {...COLLAPSE}>
        <div className="flex flex-col gap-3 border-t border-border-subtle p-3">
          <div className="flex items-center gap-2">
            <IconPicker value={project.icon} color={arc.colorHex} fallback={Folder} onChange={(icon) => onEdit({ icon })} />
            <input value={name} onChange={(event) => setName(event.target.value)} onBlur={commitName} onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()} aria-label="Project name" className={FIELD_CLASS} />
          </div>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => description !== project.description && onEdit({ description })}
            placeholder="Description…"
            rows={2}
            className={`${FIELD_CLASS} resize-none`}
          />
          <div className="flex items-end gap-2">
            <Labeled label="Status"><StatusSelect status={project.status} onChange={(status) => onEdit({ status })} className="w-full" /></Labeled>
            <button type="button" onClick={onDelete} className="shrink-0 px-2 py-1.5 text-fg-faint transition-colors duration-panel ease-panel hover:text-accent-link-broken">Delete</button>
          </div>
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
