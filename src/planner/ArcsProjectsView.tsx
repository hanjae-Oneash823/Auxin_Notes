import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Arc, EntityStatus, Project } from '../db/queries/planner/types';
import { ArcDetail } from './ArcDetail';
import { ArcList } from './ArcList';
import { ConfirmModal } from './ConfirmModal';
import { usePlannerStore } from './plannerStore';
import { PANEL_EASE } from './plannerMotion';

type Confirm =
  | { kind: 'delete-arc'; arc: Arc }
  | { kind: 'delete-project'; project: Project }
  | { kind: 'arc-status'; arc: Arc; status: EntityStatus };

/** Planner tab for managing arcs, their projects and sprints: every arc in a list on the left, the open one on the right. */
export function ArcsProjectsView() {
  const { arcs, projects, sprints, nodes } = usePlannerStore();
  const { addArc, editArc, reorderArcs, setArcStatus, removeArc, addProject, editProject, removeProject } = usePlannerStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  // Active arcs first, as the list shows them; the open arc falls back to the first when none is picked or it was deleted.
  const ordered = [...arcs].sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active'));
  const arc = ordered.find((candidate) => candidate.id === selectedId) ?? ordered[0] ?? null;

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
    <div className="flex flex-wrap items-start gap-6">
      <div className="w-[300px] shrink-0">
        <ArcList arcs={ordered} projects={projects} sprints={sprints} nodes={nodes} selectedId={arc?.id ?? null} onSelect={setSelectedId} onCreate={(name, colorHex) => void addArc(name, colorHex)} onReorder={(ids) => void reorderArcs(ids)} />
      </div>

      <div className="min-w-[360px] flex-1">
        <AnimatePresence mode="wait" initial={false}>
        {arc ? (
          <motion.div key={arc.id} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: PANEL_EASE }}>
          <ArcDetail
            arc={arc}
            projects={projects.filter((project) => project.arcId === arc.id)}
            sprints={sprints}
            nodes={nodes}
            onEditArc={(patch) => void editArc(arc.id, patch)}
            onArcStatus={(status) => changeArcStatus(arc, status)}
            onDeleteArc={() => setConfirm({ kind: 'delete-arc', arc })}
            onAddProject={(name) => void addProject({ name, arcId: arc.id })}
            onEditProject={(project, patch) => void editProject(project.id, patch)}
            onDeleteProject={(project) => setConfirm({ kind: 'delete-project', project })}
          />
          </motion.div>
        ) : (
          <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-10 text-center text-fg-faint">Create an arc to start organizing projects and sprints.</motion.p>
        )}
        </AnimatePresence>
      </div>

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
          body={`Setting “${confirm.arc.name}” to “${confirm.status}” also sets its ${projects.filter((project) => project.arcId === confirm.arc.id).length} project(s) to “${confirm.status}”.`}
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
