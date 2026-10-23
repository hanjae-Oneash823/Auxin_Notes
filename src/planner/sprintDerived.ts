import type { Arc, PlannerNode, Sprint } from '../db/queries/planner/types';
import { PROJECT_COLOR } from './quickAddMentions';

/** Past this many active sprints the dashboard box warns that nothing stands out any more. */
export const SPRINT_SOFT_LIMIT = 5;

export const activeSprints = (sprints: readonly Sprint[]): Sprint[] => sprints.filter((sprint) => sprint.status === 'active');

/** The sprint's arc color; a sprint outside any arc is grey. */
export const sprintColor = (sprint: Sprint, arcs: readonly Arc[]): string => arcs.find((arc) => arc.id === sprint.arcId)?.colorHex ?? PROJECT_COLOR;

export function sprintProgress(nodes: readonly PlannerNode[], sprintId: string): { done: number; total: number } {
  const members = nodes.filter((node) => node.sprintId === sprintId);
  return { done: members.filter((node) => node.isCompleted).length, total: members.length };
}

/** `arc:<id>` / `project:<id>` option values of the scope picker, or '' for a standalone sprint. */
export function scopeFromValue(value: string, projects: readonly { id: string; arcId: string | null }[]): { arcId: string | null; projectId: string | null } {
  const [kind, id] = value.split(':');
  if (kind === 'arc') return { arcId: id, projectId: null };
  if (kind === 'project') return { arcId: projects.find((project) => project.id === id)?.arcId ?? null, projectId: id };
  return { arcId: null, projectId: null };
}
