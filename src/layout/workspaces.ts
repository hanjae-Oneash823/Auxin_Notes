import { HOME_TAB_ID } from './TabBar';

/** A saved set of open tabs (absolute paths, Home first) and which one is
 *  focused. The name doubles as the id — names are unique per vault. */
export interface Workspace {
  name: string;
  tabs: string[];
  active: string;
  /** Tint shown on the workspace's switcher and Home chip; null = none. */
  color: string | null;
  /** Tabs the user flagged (yellow, with a flag icon); a subset of `tabs`. */
  flagged: string[];
}

/** The colors a workspace can be tinted with — a small fixed set, so the
 *  picker stays a single row of swatches. */
export const WORKSPACE_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const;

/** A workspace color mixed into the lifted card background, as an inline
 *  `background` value (undefined = leave the default). */
export function workspaceTint(color: string | null, strengthPercent = 28): string | undefined {
  return color ? `color-mix(in srgb, ${color} ${strengthPercent}%, var(--color-packet-card-bg))` : undefined;
}

export const DEFAULT_WORKSPACE = 'default';

export function emptyWorkspace(name: string): Workspace {
  return { name, tabs: [HOME_TAB_ID], active: HOME_TAB_ID, color: null, flagged: [] };
}

/** Rewrites every tab id (and the focused one) — a moved/renamed note or folder. */
export function remapWorkspace(workspace: Workspace, remap: (id: string) => string): Workspace {
  return {
    ...workspace,
    tabs: workspace.tabs.map(remap),
    active: remap(workspace.active),
    flagged: workspace.flagged.map(remap),
  };
}

/** Drops every tab `shouldRemove` matches (Home is never removed). If the
 *  focused tab goes, focus falls to the nearest surviving tab to its left,
 *  then the first tab, then Home. */
export function removeFromWorkspace(workspace: Workspace, shouldRemove: (id: string) => boolean): Workspace {
  const tabs = workspace.tabs.filter((id) => id === HOME_TAB_ID || !shouldRemove(id));
  if (tabs.length === workspace.tabs.length) return workspace;
  const flagged = workspace.flagged.filter((id) => tabs.includes(id));
  if (tabs.includes(workspace.active)) return { ...workspace, tabs, flagged };

  const activeIndex = workspace.tabs.indexOf(workspace.active);
  const priorSurvivor = [...tabs].reverse().find((id) => workspace.tabs.indexOf(id) < activeIndex);
  return { ...workspace, tabs, flagged, active: priorSurvivor ?? tabs[0] ?? HOME_TAB_ID };
}

/** Adds a tab (and its flag) to `to`, which keeps its own focus. A tab `to`
 *  already has just stays where it is there. */
export function addTabCopy(from: Workspace, to: Workspace, tabId: string): Workspace {
  const isFlagged = from.flagged.includes(tabId);
  return {
    ...to,
    tabs: to.tabs.includes(tabId) ? to.tabs : [...to.tabs, tabId],
    flagged: isFlagged && !to.flagged.includes(tabId) ? [...to.flagged, tabId] : to.flagged,
  };
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
