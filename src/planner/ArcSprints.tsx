import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PersonSimpleRun } from '@phosphor-icons/react';
import type { Arc, PlannerNode, Project, Sprint } from '../db/queries/planner/types';
import { fractionDone, tally } from './arcDerived';
import { PlannerSelect, type SelectGroup } from './PlannerSelect';
import { ProgressRing } from './ProgressRing';
import { FIELD_CLASS } from './plannerStyles';
import { usePlannerStore } from './plannerStore';
import { GHOST_BUTTON } from './NewArcForm';
import { Panel } from './Panel';
import { COLLAPSE, LIST_ITEM } from './plannerMotion';

const WHOLE_ARC = '';

interface ArcSprintsProps {
  arc: Arc;
  projects: readonly Project[];
  sprints: readonly Sprint[];
  nodes: readonly PlannerNode[];
}

/** The arc's sprints: rename, move between the arc and its projects, end, or start a new one. Ended sprints are only counted. */
export function ArcSprints({ arc, projects, sprints, nodes }: ArcSprintsProps) {
  const { addSprint, renameSprint, setSprintScope, endSprint } = usePlannerStore();
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [newScope, setNewScope] = useState(WHOLE_ARC);

  const mine = sprints.filter((sprint) => sprint.arcId === arc.id);
  const active = mine.filter((sprint) => sprint.status === 'active');
  const endedCount = mine.length - active.length;
  const scopeGroups: SelectGroup[] = [{ options: [{ value: WHOLE_ARC, label: 'Whole arc' }, ...projects.filter((project) => project.status === 'active').map((project) => ({ value: project.id, label: project.name }))] }];

  const scopeFor = (projectId: string) => ({ arcId: arc.id, projectId: projectId || null });

  function commitRename(sprint: Sprint) {
    const name = renaming?.draft.trim();
    setRenaming(null);
    if (name && name !== sprint.name) void renameSprint(sprint.id, name);
  }

  function create() {
    const name = draft.trim();
    if (name) void addSprint({ name, ...scopeFor(newScope) });
    setDraft('');
    setNewScope(WHOLE_ARC);
    setIsAdding(false);
  }

  return (
    <Panel title="Sprints" count={active.length} actions={<button type="button" onClick={() => setIsAdding(true)} className={GHOST_BUTTON}>+ Sprint</button>}>

      <AnimatePresence initial={false}>
      {isAdding && (
        <motion.div key="new-sprint" {...COLLAPSE}>
        <div className="flex gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') create(); if (event.key === 'Escape') setIsAdding(false); }}
            placeholder="Sprint name, then Enter"
            aria-label="Sprint name"
            className={FIELD_CLASS}
          />
          <PlannerSelect value={newScope} onChange={setNewScope} groups={scopeGroups} ariaLabel="Sprint scope" className="min-w-[140px]" />
        </div>
        </motion.div>
      )}
      </AnimatePresence>

      {active.length === 0 && !isAdding && <p className="px-1 text-fg-faint">No active sprints in this arc.</p>}
      <AnimatePresence initial={false}>
      {active.map((sprint) => {
        const counts = tally(nodes, (node) => node.sprintId === sprint.id);
        return (
          <motion.div key={sprint.id} {...LIST_ITEM} className="flex items-center gap-3 rounded-tab border border-border-subtle bg-bg px-3 py-2">
            <PersonSimpleRun size={14} weight="bold" className="shrink-0" style={{ color: arc.colorHex }} />
            {renaming?.id === sprint.id ? (
              <input
                autoFocus
                value={renaming.draft}
                onFocus={(event) => event.target.select()}
                onChange={(event) => setRenaming({ id: sprint.id, draft: event.target.value })}
                onKeyDown={(event) => { if (event.key === 'Enter') commitRename(sprint); if (event.key === 'Escape') setRenaming(null); }}
                onBlur={() => commitRename(sprint)}
                aria-label="Sprint name"
                className="min-w-0 flex-1 border border-border-strong bg-bg-packet px-1.5 py-0 font-medium text-fg-prominent outline-none"
              />
            ) : (
              <button type="button" title="Click to rename" onClick={() => setRenaming({ id: sprint.id, draft: sprint.name })} className="min-w-0 flex-1 truncate text-left font-medium hover:underline" style={{ color: arc.colorHex }}>
                {sprint.name}
              </button>
            )}
            <PlannerSelect value={sprint.projectId ?? WHOLE_ARC} onChange={(value) => void setSprintScope(sprint.id, scopeFor(value))} groups={scopeGroups} ariaLabel="Sprint scope" className="w-48 shrink-0" />
            <span className="w-10 shrink-0 text-right text-fg-faint tabular-nums" style={{ fontSize: '0.75rem' }}>{counts.done}/{counts.total}</span>
            <ProgressRing fraction={fractionDone(counts)} color={arc.colorHex} label={`${sprint.name} progress`} value={counts.done} max={counts.total} size={22} stroke={2.5} />
            <button type="button" onClick={() => void endSprint(sprint.id)} className="shrink-0 text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent">End</button>
          </motion.div>
        );
      })}
      </AnimatePresence>
      {endedCount > 0 && <p className="px-1 text-fg-faint" style={{ fontSize: '0.72rem' }}>{endedCount} ended</p>}
    </Panel>
  );
}
