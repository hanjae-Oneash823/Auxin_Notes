import type { PlannerNode } from '../db/queries/planner/types';
import { usePlannerStore } from './plannerStore';

/** Active arcs and their active projects, with counts of open one-off nodes
 *  (routine occurrences are left out — there is a year of them). */
export function ArcsProjectsPanel() {
  const arcs = usePlannerStore((state) => state.arcs);
  const projects = usePlannerStore((state) => state.projects);
  const nodes = usePlannerStore((state) => state.nodes);

  const openCount = (match: (node: PlannerNode) => boolean) => nodes.filter((node) => !node.isCompleted && !node.isRoutine && match(node)).length;
  const activeArcs = arcs.filter((arc) => arc.status === 'active');

  return (
    <aside className="flex flex-col gap-3 rounded-tab border border-border-subtle p-3.5">
      <h3 className="font-semibold text-fg-prominent" style={{ fontSize: '0.95rem' }}>Arcs & projects</h3>
      {activeArcs.length === 0 && <p className="text-fg-faint">No active arcs.</p>}
      {activeArcs.map((arc) => (
        <div key={arc.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: arc.colorHex }} />
            <span className="min-w-0 flex-1 truncate text-fg-prominent">{arc.name}</span>
            <span className="text-fg-faint" style={{ fontSize: '0.72rem' }}>{openCount((n) => n.arcId === arc.id)} open</span>
          </div>
          {projects.filter((project) => project.arcId === arc.id && project.status === 'active').map((project) => (
            <div key={project.id} className="flex items-center gap-2 pl-4 text-fg-muted">
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <span className="text-fg-faint" style={{ fontSize: '0.72rem' }}>{openCount((n) => n.projectId === project.id)}</span>
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}
