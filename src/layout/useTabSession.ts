import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getAppConfig } from '../app/appConfig';
import { getDb } from '../db/client';
import { getSavedWorkspaces, setSavedWorkspaces, type SavedWorkspaces } from '../db/queries/workspaces';
import { HOME_TAB_ID } from './TabBar';
import { DEFAULT_WORKSPACE, type Workspace } from './workspaces';

/** Wait for tab changes to settle (rapid open/close/reorder) before writing
 *  the config file. */
const SAVE_DEBOUNCE_MS = 400;

/** Crash-loop guard. A restore that takes the web process down (WebKit then
 *  auto-reloads the page, which would restore and crash again, forever) leaves
 *  this marker behind, because it is only cleared once the app has survived
 *  `RESTORE_STABLE_MS` after restoring. Seeing it at startup means the last
 *  restore crashed, so this launch skips restoring. */
const RESTORE_ATTEMPT_KEY = 'auxin.tabRestoreAttempt';
const RESTORE_STABLE_MS = 5000;

function readRestoreMarker(): boolean {
  try {
    return window.localStorage.getItem(RESTORE_ATTEMPT_KEY) !== null;
  } catch {
    return false;
  }
}

function writeRestoreMarker(isSet: boolean): void {
  try {
    if (isSet) window.localStorage.setItem(RESTORE_ATTEMPT_KEY, String(Date.now()));
    else window.localStorage.removeItem(RESTORE_ATTEMPT_KEY);
  } catch {
    // Storage unavailable: the guard just can't protect this launch.
  }
}

interface UseTabSessionArgs {
  vaultRoot: string | null;
  /** Every workspace; each one's tabs include the pinned Home tab. */
  workspaces: Workspace[];
  currentName: string;
  /** Saved focus that has been restored but not yet applied (see
   *  useWorkspaces); saving pauses while it is set so it can't be
   *  overwritten with Home. */
  pendingActiveId: string | null;
  restoreWorkspaces: (workspaces: Workspace[], currentName: string) => void;
}

/** The vault's saved workspaces (vault-relative tabs), always including the
 *  default one. A vault with none yet takes its old config-file session, if
 *  any, as the default workspace. */
async function loadSaved(root: string): Promise<SavedWorkspaces> {
  const db = await getDb(root);
  let saved = await getSavedWorkspaces(db);
  if (!saved) {
    const legacy = (await getAppConfig()).tab_sessions?.[root];
    const prefix = `${root}/`;
    const toRelative = (path: string) => (path.startsWith(prefix) ? path.slice(prefix.length) : null);
    saved = {
      workspaces: [
        {
          name: DEFAULT_WORKSPACE,
          tabs: (legacy?.tabs ?? []).flatMap((path) => toRelative(path) ?? []),
          active: legacy?.active ? toRelative(legacy.active) : null,
        },
      ],
      current: null,
    };
  }
  return saved.workspaces.some((w) => w.name === DEFAULT_WORKSPACE)
    ? saved
    : { ...saved, workspaces: [{ name: DEFAULT_WORKSPACE, tabs: [], active: null }, ...saved.workspaces] };
}

/** Keeps the workspaces and their open tabs across reloads and relaunches.
 *
 *  On a vault's first appearance the saved session is loaded, filtered down
 *  to files that still exist inside that vault, and handed to `restoreWorkspaces`.
 *  Saving only starts after that restore has finished, so the initial
 *  Home-only state can never overwrite a saved session. If the restore
 *  fails, saving stays off for the run rather than risk clobbering it. */
export function useTabSession({
  vaultRoot,
  workspaces,
  currentName,
  pendingActiveId,
  restoreWorkspaces,
}: UseTabSessionArgs): void {
  const restoredVaultRef = useRef<string | null>(null);
  const restoreWorkspacesRef = useRef(restoreWorkspaces);
  restoreWorkspacesRef.current = restoreWorkspaces;

  useEffect(() => {
    if (!vaultRoot) {
      restoredVaultRef.current = null;
      return;
    }
    let isCancelled = false;

    async function restore(root: string) {
      if (readRestoreMarker()) {
        console.error('Last tab restore did not finish (crash?) — skipping it and starting fresh');
        writeRestoreMarker(false);
        // Deliberately NOT marking the vault as restored: that would switch
        // saving on, and the empty Home-only state would overwrite the saved
        // workspaces on disk. Saving stays off for this run; the next launch
        // (marker now cleared) restores normally.
        return;
      }
      const saved = await loadSaved(root);
      const toAbsolute = (relative: string) => `${root}/${relative}`;
      const candidates = saved.workspaces.flatMap((w) => w.tabs.map(toAbsolute));
      const surviving = new Set(candidates.length > 0 ? await invoke<string[]>('existing_paths', { paths: candidates }) : []);
      if (isCancelled) return;
      // Set only once this run is the one that will really restore. Setting it
      // up front made React StrictMode's second effect run (dev) see the first
      // run's marker, skip its restore as a "crash", while the first run was
      // already cancelled — so nothing was ever restored.
      writeRestoreMarker(true);

      const restored = saved.workspaces.map((w): Workspace => {
        const tabs = w.tabs.map(toAbsolute).filter((path) => surviving.has(path));
        const active = w.active ? toAbsolute(w.active) : null;
        return {
          name: w.name,
          tabs: [HOME_TAB_ID, ...tabs],
          active: active && tabs.includes(active) ? active : HOME_TAB_ID,
          color: w.color ?? null,
          flagged: (w.flagged ?? []).map(toAbsolute).filter((path) => tabs.includes(path)),
        };
      });
      const wanted = saved.current;
      restoreWorkspacesRef.current(restored, restored.some((w) => w.name === wanted) ? wanted! : DEFAULT_WORKSPACE);
      restoredVaultRef.current = root;
      window.setTimeout(() => writeRestoreMarker(false), RESTORE_STABLE_MS);
    }

    restore(vaultRoot).catch((error: unknown) => {
      console.error('Failed to restore open tabs', error);
    });
    return () => {
      isCancelled = true;
    };
  }, [vaultRoot]);

  useEffect(() => {
    if (!vaultRoot || restoredVaultRef.current !== vaultRoot || pendingActiveId !== null) return;
    const prefix = `${vaultRoot}/`;
    const toRelative = (id: string) => (id.startsWith(prefix) ? id.slice(prefix.length) : id);
    const session: SavedWorkspaces = {
      workspaces: workspaces.map((w) => ({
        name: w.name,
        tabs: w.tabs.filter((id) => id !== HOME_TAB_ID).map(toRelative),
        active: w.active === HOME_TAB_ID ? null : toRelative(w.active),
        color: w.color,
        flagged: w.flagged.map(toRelative),
      })),
      current: currentName,
    };

    const timer = window.setTimeout(() => {
      getDb(vaultRoot)
        .then((db) => setSavedWorkspaces(db, session))
        .catch((error: unknown) => {
          console.error('Failed to save open tabs', error);
        });
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [vaultRoot, workspaces, currentName, pendingActiveId]);
}
