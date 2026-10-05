import type { Arc, PlannerGroup, Project } from '../db/queries/planner/types';

export type MentionType = 'arc' | 'project' | 'group';

export interface MentionOption {
  id: string;
  /** What `@` filters on: `arc-School`, `project-Thesis`, `group-Deep_work`. */
  label: string;
  display: string;
  color: string;
  type: MentionType;
}

/** Projects have no color of their own; Mycelium draws them in this grey. */
export const PROJECT_COLOR = '#b0b0a8';

const slug = (name: string) => name.replace(/\s+/g, '_');

/** The text typed after the last `@` before the cursor, or null when the cursor isn't in a mention. */
export function mentionQueryAt(value: string, cursor: number): string | null {
  const before = value.slice(0, cursor);
  const atIndex = before.lastIndexOf('@');
  if (atIndex === -1) return null;
  const query = before.slice(atIndex + 1);
  return query.includes(' ') ? null : query;
}

/** The value with the `@query` under the cursor removed. */
export function withoutMention(value: string, cursor: number): string {
  const before = value.slice(0, cursor);
  return (before.slice(0, before.lastIndexOf('@')) + value.slice(cursor)).trimStart();
}

/** Active arcs and groups always; projects only once an arc is picked, and only that arc's. */
export function mentionOptions(
  arcs: readonly Arc[],
  projects: readonly Project[],
  groups: readonly PlannerGroup[],
  selectedArcId: string | null,
): MentionOption[] {
  return [
    ...arcs.filter((arc) => arc.status === 'active').map((arc): MentionOption => ({ id: arc.id, label: `arc-${slug(arc.name)}`, display: arc.name, color: arc.colorHex, type: 'arc' })),
    ...(selectedArcId
      ? projects
          .filter((project) => project.status === 'active' && project.arcId === selectedArcId)
          .map((project): MentionOption => ({ id: project.id, label: `project-${slug(project.name)}`, display: project.name, color: PROJECT_COLOR, type: 'project' }))
      : []),
    ...groups.filter((group) => !group.isUngrouped).map((group): MentionOption => ({ id: group.id, label: `group-${slug(group.name)}`, display: group.name, color: group.colorHex, type: 'group' })),
  ];
}

export function filterMentions(options: readonly MentionOption[], query: string): MentionOption[] {
  const needle = query.toLowerCase();
  return options.filter((option) => option.label.toLowerCase().includes(needle));
}
