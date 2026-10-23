import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Arc, EntityStatus, PlannerNode, Project, Sprint } from '../db/queries/planner/types';
import type { ProjectPatch } from '../db/queries/planner/structure';
import { Compass } from '@phosphor-icons/react';
import { agoLabel, latestCompletion } from './arcDerived';
import { ArcAnalytics } from './ArcAnalytics';
import { IconPicker } from './IconPicker';
import { ArcSprints } from './ArcSprints';
import { ColorDots, GHOST_BUTTON } from './NewArcForm';
import { ProjectRow } from './ProjectRow';
import { Panel } from './Panel';
import { COLLAPSE, LIST_ITEM, PANEL_TRANSITION } from './plannerMotion';
import { StatusSelect } from './StatusSelect';
import { FIELD_CLASS } from './plannerStyles';

interface ArcDetailProps {
  arc: Arc;
  projects: readonly Project[];
  sprints: readonly Sprint[];
  nodes: readonly PlannerNode[];
  onEditArc: (patch: { name?: string; description?: string; colorHex?: string; icon?: string }) => void;
  onArcStatus: (status: EntityStatus) => void;
  onDeleteArc: () => void;
  onAddProject: (name: string) => void;
  onEditProject: (project: Project, patch: ProjectPatch) => void;
  onDeleteProject: (project: Project) => void;
}

/** Each block of the detail pane rises into place a beat after the one above it. */
const STAGGER_S = 0.06;
const rise = (index: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { ...PANEL_TRANSITION, delay: index * STAGGER_S } });

/** The open arc: editable identity and status, read-only task numbers, its projects (edited in place) and its sprints. */
export function ArcDetail({ arc, projects, sprints, nodes, onEditArc, onArcStatus, onDeleteArc, onAddProject, onEditProject, onDeleteProject }: ArcDetailProps) {
  const [nameDraft, setNameDraft] = useState(arc.name);
  const [descDraft, setDescDraft] = useState(arc.description);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [projectDraft, setProjectDraft] = useState('');
  const descRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setNameDraft(arc.name); setDescDraft(arc.description); }, [arc.id, arc.name, arc.description]);

  // Grow the description to its text so there is no empty row under a short one.
  useEffect(() => {
    const field = descRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [descDraft]);

  const ordered = [...projects].sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active'));

  const now = new Date();
  const startedLine = `Started ${new Date(arc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${agoLabel(arc.createdAt, now)}`;
  const lastDone = latestCompletion(nodes, (node) => node.arcId === arc.id);
  const activeProjects = projects.filter((project) => project.status === 'active').length;
  const activeSprints = sprints.filter((sprint) => sprint.arcId === arc.id && sprint.status === 'active').length;
  const activityLine = [
    `${activeProjects} active ${activeProjects === 1 ? 'project' : 'projects'}`,
    `${activeSprints} active ${activeSprints === 1 ? 'sprint' : 'sprints'}`,
    lastDone ? `last task finished ${agoLabel(lastDone, now)}` : 'no tasks finished yet',
  ].join(' · ');

  function commitName() {
    const name = nameDraft.trim();
    if (!name) setNameDraft(arc.name);
    else if (name !== arc.name) onEditArc({ name });
  }

  function createProject() {
    const name = projectDraft.trim();
    if (name) onAddProject(name);
    setProjectDraft('');
    setIsAddingProject(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <motion.div {...rise(0)} className="relative z-10 flex flex-col gap-4 px-4 pt-1">
        {/* Roomy under the name, tight under the info lines: the -mb trims the box's own gap before the description. */}
        <div className="-mb-3 flex flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <IconPicker value={arc.icon} color={arc.colorHex} fallback={Compass} onChange={(icon) => onEditArc({ icon })} />
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
              aria-label="Arc name"
              className="min-w-0 flex-1 bg-transparent font-semibold text-fg-prominent outline-none"
              style={{ fontSize: '1.6rem', lineHeight: 1.2 }}
            />
            <div className="flex shrink-0 items-center gap-1.5">
              <ColorDots isCollapsible value={arc.colorHex} onChange={(colorHex) => onEditArc({ colorHex })} />
              <StatusSelect status={arc.status} onChange={onArcStatus} isCompact />
              <button type="button" onClick={onDeleteArc} className="flex h-7 items-center rounded-tab px-2 text-fg-faint transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-accent-link-broken">Delete</button>
            </div>
          </div>
          <div className="text-fg-faint" style={{ fontSize: '0.78rem', lineHeight: 1.35 }}>
            <p>{startedLine}</p>
            <p>{activityLine}</p>
          </div>
        </div>
        <textarea
          ref={descRef}
          value={descDraft}
          onChange={(event) => setDescDraft(event.target.value)}
          onBlur={() => descDraft !== arc.description && onEditArc({ description: descDraft })}
          placeholder="What is this arc about?"
          rows={1}
          className="w-full resize-none overflow-hidden bg-transparent p-0 text-fg-muted outline-none placeholder:text-fg-faint"
        />
        <ArcAnalytics arc={arc} nodes={nodes} />
      </motion.div>

      <motion.div {...rise(1)}>
      <Panel title="Projects" count={projects.length} actions={<button type="button" onClick={() => setIsAddingProject(true)} className={GHOST_BUTTON}>+ Project</button>}>
        <AnimatePresence initial={false}>
        {isAddingProject && (
          <motion.div key="new-project" {...COLLAPSE}>
          <input
            autoFocus
            value={projectDraft}
            onChange={(event) => setProjectDraft(event.target.value)}
            onBlur={createProject}
            onKeyDown={(event) => { if (event.key === 'Enter') createProject(); if (event.key === 'Escape') { setProjectDraft(''); setIsAddingProject(false); } }}
            placeholder="Project name, then Enter"
            aria-label="Project name"
            className={FIELD_CLASS}
          />
          </motion.div>
        )}
        </AnimatePresence>
        {ordered.length === 0 && !isAddingProject && <p className="px-1 text-fg-faint">No projects yet.</p>}
        <AnimatePresence initial={false}>
          {ordered.map((project) => (
            <motion.div key={project.id} {...LIST_ITEM}>
              <ProjectRow project={project} arc={arc} nodes={nodes} onEdit={(patch) => onEditProject(project, patch)} onDelete={() => onDeleteProject(project)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </Panel>
      </motion.div>

      <motion.div {...rise(2)}>
        <ArcSprints arc={arc} projects={projects} sprints={sprints} nodes={nodes} />
      </motion.div>
    </div>
  );
}
