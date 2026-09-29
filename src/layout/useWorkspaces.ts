import { useState } from 'react';
import { HOME_TAB_ID } from './TabBar';
import { reorderIds } from './tabOrder';
import { useTabSession } from './useTabSession';
import {
  DEFAULT_WORKSPACE,
  emptyWorkspace,
  addTabCopy,
  neighborWorkspaceName,
  remapWorkspace,
  removeFromWorkspace,
  workspaceNameError,
  type Workspace,
} from './workspaces';

/** Owns every workspace's tabs plus which one is current. The tab commands
 *  (open/close/reorder) act on the current workspace; rename, move and
 *  delete act on all of them, so a note's tab follows it (or disappears with
 *  it) no matter which workspace it lives in. */
export function useWorkspaces(vaultRoot: string | null) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([emptyWorkspace(DEFAULT_WORKSPACE)]);
  const [currentName, setCurrentName] = useState(DEFAULT_WORKSPACE);
  // The saved focus is held back here rather than applied with the restored
  // tabs: mounting a note's editor at startup, before the note index has
  // loaded, crashed the web process. VaultReady applies it once notes exist.
  const [pendingActiveId, setPendingActiveId] = useState<string | null>(null);

  const current = workspaces.find((workspace) => workspace.name === currentName) ?? workspaces[0];
  const names = workspaces.map((workspace) => workspace.name);

  useTabSession({
    vaultRoot,
    workspaces,
    currentName: current.name,
    pendingActiveId,
    restoreWorkspaces: (restored, restoredName) => {
      const saved = restored.find((workspace) => workspace.name === restoredName);
      setWorkspaces(restored.map((w) => (w === saved ? { ...w, active: HOME_TAB_ID } : w)));
      setCurrentName(restoredName);
      setPendingActiveId(saved && saved.active !== HOME_TAB_ID ? saved.active : null);
    },
  });

  function updateCurrent(update: (workspace: Workspace) => Workspace) {
    setWorkspaces((prev) => prev.map((workspace) => (workspace.name === current.name ? update(workspace) : workspace)));
  }

  function updateAll(update: (workspace: Workspace) => Workspace) {
    setWorkspaces((prev) => prev.map(update));
  }

  /** Opens a note's tab, focusing it if already open rather than duplicating it. */
  function openAbsolutePath(absolutePath: string) {
    updateCurrent((w) => ({
      ...w,
      tabs: w.tabs.includes(absolutePath) ? w.tabs : [...w.tabs, absolutePath],
      active: absolutePath,
    }));
  }

  /** Closes a tab in the current workspace. The pinned HOME tab ignores this. */
  function closeTab(tabId: string) {
    if (tabId === HOME_TAB_ID) return;
    updateCurrent((w) => removeFromWorkspace(w, (id) => id === tabId));
  }

  /** Closes every tab in the current workspace (Home stays). */
  function closeAllTabs() {
    updateCurrent((w) => removeFromWorkspace(w, () => true));
  }

  /** Removes matching tabs from every workspace — a deleted note or folder. */
  function removeTabsEverywhere(shouldRemove: (tabId: string) => boolean) {
    updateAll((w) => removeFromWorkspace(w, shouldRemove));
  }

  function renameTabId(oldId: string, newId: string) {
    updateAll((w) => remapWorkspace(w, (id) => (id === oldId ? newId : id)));
  }

  /** Remaps every tab under `oldAbsolutePrefix` (a moved or renamed folder)
   *  to the equivalent path under `newAbsolutePrefix`. */
  function remapTabsUnderFolder(oldAbsolutePrefix: string, newAbsolutePrefix: string) {
    const withSlash = `${oldAbsolutePrefix}/`;
    updateAll((w) =>
      remapWorkspace(w, (id) => (id.startsWith(withSlash) ? `${newAbsolutePrefix}/${id.slice(withSlash.length)}` : id)),
    );
  }

  /** Moves `draggedId` to sit next to `targetId` — after it when `placeAfter`
   *  is true, so dropping past the last tab can still reach the rightmost
   *  position. HOME is pinned first and never participates. */
  function reorderTabs(draggedId: string, targetId: string, placeAfter: boolean) {
    if (draggedId === HOME_TAB_ID || targetId === HOME_TAB_ID) return;
    updateCurrent((w) => ({ ...w, tabs: reorderIds(w.tabs, draggedId, targetId, placeAfter) }));
  }

  function setActiveTabId(tabId: string) {
    updateCurrent((w) => ({ ...w, active: tabId }));
  }

  /** Steps to the next/previous workspace (wrapping). Returns the new name,
   *  or null when there's nowhere to go. */
  function stepWorkspace(step: 1 | -1): string | null {
    if (names.length < 2) return null;
    const next = neighborWorkspaceName(names, current.name, step);
    setCurrentName(next);
    return next;
  }

  /** Creates and switches to a new empty workspace. Returns an error message
   *  when the name is unusable, else null. */
  function createWorkspace(name: string): string | null {
    const error = workspaceNameError(names, name);
    if (error) return error;
    const trimmed = name.trim();
    setWorkspaces((prev) => [...prev, emptyWorkspace(trimmed)]);
    setCurrentName(trimmed);
    return null;
  }

  function toggleFlag(tabId: string) {
    if (tabId === HOME_TAB_ID) return;
    updateCurrent((w) => ({
      ...w,
      flagged: w.flagged.includes(tabId) ? w.flagged.filter((id) => id !== tabId) : [...w.flagged, tabId],
    }));
  }

  /** Sends a tab from the current workspace to another one — or, with
   *  `shouldKeep`, copies it there and leaves it in this one too. */
  function sendTabToWorkspace(tabId: string, targetName: string, shouldKeep: boolean) {
    if (tabId === HOME_TAB_ID || targetName === current.name) return;
    setWorkspaces((prev) => {
      const from = prev.find((w) => w.name === current.name);
      const to = prev.find((w) => w.name === targetName);
      if (!from || !to) return prev;
      const nextTo = addTabCopy(from, to, tabId);
      const nextFrom = shouldKeep ? from : removeFromWorkspace(from, (id) => id === tabId);
      return prev.map((w) => (w === from ? nextFrom : w === to ? nextTo : w));
    });
  }

  const moveTabToWorkspace = (tabId: string, targetName: string) => sendTabToWorkspace(tabId, targetName, false);
  const duplicateTabToWorkspace = (tabId: string, targetName: string) => sendTabToWorkspace(tabId, targetName, true);

  function setWorkspaceColor(name: string, color: string | null) {
    setWorkspaces((prev) => prev.map((w) => (w.name === name ? { ...w, color } : w)));
  }

  function switchWorkspace(name: string) {
    if (names.includes(name)) setCurrentName(name);
  }

  /** Renames a workspace (never the default). Returns an error message when
   *  the new name is unusable, else null. */
  function renameWorkspace(name: string, newName: string): string | null {
    if (name === DEFAULT_WORKSPACE) return 'The default workspace can\'t be renamed';
    const trimmed = newName.trim();
    if (trimmed === name) return null;
    const error = workspaceNameError(names.filter((existing) => existing !== name), trimmed);
    if (error) return error;
    setWorkspaces((prev) => prev.map((w) => (w.name === name ? { ...w, name: trimmed } : w)));
    if (current.name === name) setCurrentName(trimmed);
    return null;
  }

  /** Deletes a workspace (never the default) and falls back to the default.
   *  Only its tab list goes — the notes themselves are untouched. */
  function deleteWorkspace(name: string) {
    if (name === DEFAULT_WORKSPACE) return;
    setWorkspaces((prev) => prev.filter((workspace) => workspace.name !== name));
    if (current.name === name) setCurrentName(DEFAULT_WORKSPACE);
  }

  return {
    tabs: current.tabs,
    flaggedTabs: current.flagged,
    toggleFlag,
    moveTabToWorkspace,
    duplicateTabToWorkspace,
    activeTabId: current.active,
    pendingActiveId,
    clearPendingActive: () => setPendingActiveId(null),
    setActiveTabId,
    openAbsolutePath,
    closeTab,
    closeAllTabs,
    removeTabsEverywhere,
    renameTabId,
    remapTabsUnderFolder,
    reorderTabs,
    workspaceNames: names,
    workspaceColors: Object.fromEntries(workspaces.map((w) => [w.name, w.color])),
    setWorkspaceColor,
    currentWorkspace: current.name,
    stepWorkspace,
    switchWorkspace,
    renameWorkspace,
    createWorkspace,
    deleteWorkspace,
  };
}
