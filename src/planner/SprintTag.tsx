import { PersonSimpleRun } from '@phosphor-icons/react';
import { usePlannerStore } from './plannerStore';
import { sprintColor } from './sprintDerived';

/** The running-person icon and sprint name on a task card; nothing when the node is in no sprint. */
export function SprintTag({ sprintId }: { sprintId: string | null }) {
  const sprint = usePlannerStore((state) => state.sprints).find((candidate) => candidate.id === sprintId);
  const arcs = usePlannerStore((state) => state.arcs);
  if (!sprint) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5" style={{ color: sprintColor(sprint, arcs) }}>
      <PersonSimpleRun size={11} weight="bold" />
      {sprint.name}
    </span>
  );
}
