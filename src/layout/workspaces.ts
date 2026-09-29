import { HOME_TAB_ID } from './TabBar';

/** A saved set of open tabs (absolute paths, Home first) and which one is
 *  focused. The name doubles as the id — names are unique per vault. */
export interface Workspace {
  name: string;
  tabs: string[];
  active: string;
}

export const DEFAULT_WORKSPACE = 'default';

export function emptyWorkspace(name: string): Workspace {
  return { name, tabs: [HOME_TAB_ID], active: HOME_TAB_ID };
}

/** Rewrites every tab id (and the focused one) — a moved/renamed note or folder. */
export function remapWorkspace(workspace: Workspace, remap: (id: string) => string): Workspace {
  return { ...workspace, tabs: workspace.tabs.map(remap), active: remap(workspace.active) };
}

/** Drops every tab `shouldRemove` matches (Home is never removed). If the
 *  focused tab goes, focus falls to the nearest surviving tab to its left,
 *  then the first tab, then Home. */
export function removeFromWorkspace(workspace: Workspace, shouldRemove: (id: string) => boolean): Workspace {
  const tabs = workspace.tabs.filter((id) => id === HOME_TAB_ID || !shouldRemove(id));
  if (tabs.length === workspace.tabs.length) return workspace;
  if (tabs.includes(workspace.active)) return { ...workspace, tabs };

  const activeIndex = workspace.tabs.indexOf(workspace.active);
  const priorSurvivor = [...tabs].reverse().find((id) => workspace.tabs.indexOf(id) < activeIndex);
  return { ...workspace, tabs, active: priorSurvivor ?? tabs[0] ?? HOME_TAB_ID };
}

/** Cycles `step` places through the workspaces, wrapping at the ends. */
export function neighborWorkspaceName(names: string[], current: string, step: 1 | -1): string {
  const index = names.indexOf(current);
  return names[(index + step + names.length) % names.length];
}

/** Why `name` can't be used for a new workspace, or null if it's fine. */
export function workspaceNameError(names: string[], name: string): string | null {
  if (!name.trim()) return 'Name required';
  const isTaken = names.some((existing) => existing.toLowerCase() === name.trim().toLowerCase());
  return isTaken ? 'Already exists' : null;
}
