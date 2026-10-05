import { create } from 'zustand';
import type Database from '@tauri-apps/plugin-sql';
import { getPlannerDb } from '../db/plannerClient';
import {
  addNodesToSession, createLocation, createSession, deleteLocation, deleteSession, endSessionAt, finishNode, listAllSessionNodes,
  listLocations, listPauses, listRecentSessions, markNodeIncomplete, pauseSession, removeNodeFromSession, resumeSession,
  returnNodeToQueue, startNode, startSession,
} from '../db/queries/planner/sessions';
import type { SessionNode, SessionPause, WorkLocation, WorkSession } from '../db/queries/planner/types';
import { localDateKey } from '../db/queries/planner/util';
import { usePlannerStore } from './plannerStore';

/** Mycelium's session log shows every session; 155 so far, so load generously. */
const SESSION_LIMIT = 1000;

interface SessionData {
  locations: WorkLocation[];
  sessions: WorkSession[];
  /** Every session's node entries, in one list. */
  sessionNodes: SessionNode[];
  /** Pauses of the active session only. */
  activePauses: SessionPause[];
}

interface SessionState extends SessionData {
  vaultRoot: string | null;
  isLoaded: boolean;
  error: string | null;

  load: (vaultRoot: string) => Promise<void>;
  dismissError: () => void;

  /** Creates a session at the location and starts it right away. */
  start: (locationId: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  /** Ends the session now, or at `endTime` (an ISO instant in the past) for one that was left running. */
  end: (status: 'completed' | 'interrupted', endTime?: string) => Promise<void>;
  remove: (sessionId: string) => Promise<void>;

  addNodes: (sessionId: string, nodeIds: readonly string[]) => Promise<void>;
  /** Puts the node into the live session (if it isn't there yet) and starts it. No-op without a live session. */
  doNow: (nodeId: string) => Promise<void>;
  startNode: (sessionId: string, nodeId: string) => Promise<void>;
  finishNode: (sessionId: string, nodeId: string) => Promise<void>;
  markIncomplete: (sessionId: string, nodeId: string) => Promise<void>;
  returnToQueue: (sessionId: string, nodeId: string) => Promise<void>;
  removeNode: (sessionId: string, nodeId: string) => Promise<void>;

  addLocation: (name: string) => Promise<void>;
  removeLocation: (id: string) => Promise<void>;
}

const EMPTY_DATA: SessionData = { locations: [], sessions: [], sessionNodes: [], activePauses: [] };

const isLive = (session: WorkSession): boolean => session.status === 'active' || session.status === 'paused';

export const selectActiveSession = (state: Pick<SessionState, 'sessions'>): WorkSession | null =>
  state.sessions.find(isLive) ?? null;

async function fetchAll(db: Database): Promise<SessionData> {
  const [locations, sessions, sessionNodes] = await Promise.all([
    listLocations(db), listRecentSessions(db, SESSION_LIMIT), listAllSessionNodes(db),
  ]);
  const active = sessions.find(isLive);
  return { locations, sessions, sessionNodes, activePauses: active ? await listPauses(db, active.id) : [] };
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const useSessionStore = create<SessionState>((set, get) => {
  /** Runs a database change, then reloads sessions. `alsoNodes` also reloads the planner's nodes (finishing a node completes it). */
  async function mutate(work: (db: Database) => Promise<void>, alsoNodes = false): Promise<void> {
    const { vaultRoot } = get();
    if (!vaultRoot) {
      set({ error: 'The planner is not loaded yet.' });
      return;
    }
    try {
      const db = await getPlannerDb(vaultRoot);
      await work(db);
      set(await fetchAll(db));
      if (alsoNodes) await usePlannerStore.getState().refresh();
    } catch (error) {
      set({ error: messageOf(error) });
    }
  }

  const activeId = (): string | null => selectActiveSession(get())?.id ?? null;

  return {
    ...EMPTY_DATA,
    vaultRoot: null,
    isLoaded: false,
    error: null,

    load: async (vaultRoot) => {
      set({ vaultRoot, isLoaded: false, error: null });
      try {
        set({ ...(await fetchAll(await getPlannerDb(vaultRoot))), isLoaded: true });
      } catch (error) {
        set({ error: messageOf(error), isLoaded: true });
      }
    },
    dismissError: () => set({ error: null }),

    start: (locationId) => mutate(async (db) => {
      const session = await createSession(db, locationId, localDateKey());
      await startSession(db, session.id);
    }),
    pause: () => mutate(async (db) => {
      const id = activeId();
      if (id) await pauseSession(db, id);
    }),
    resume: () => mutate(async (db) => {
      const id = activeId();
      const openPause = get().activePauses.find((pause) => pause.resumedAt === null);
      if (id && openPause) await resumeSession(db, id, openPause.id);
    }),
    end: (status, endTime) => mutate(async (db) => {
      const id = activeId();
      if (id) await endSessionAt(db, id, status, endTime);
    }),
    remove: (sessionId) => mutate((db) => deleteSession(db, sessionId)),

    addNodes: (sessionId, nodeIds) => mutate((db) => addNodesToSession(db, sessionId, nodeIds)),
    doNow: (nodeId) => mutate(async (db) => {
      const id = activeId();
      if (!id) return;
      await addNodesToSession(db, id, [nodeId]);
      await startNode(db, id, nodeId);
    }),
    startNode: (sessionId, nodeId) => mutate((db) => startNode(db, sessionId, nodeId)),
    finishNode: (sessionId, nodeId) => mutate((db) => finishNode(db, sessionId, nodeId), true),
    markIncomplete: (sessionId, nodeId) => mutate((db) => markNodeIncomplete(db, sessionId, nodeId)),
    returnToQueue: (sessionId, nodeId) => mutate((db) => returnNodeToQueue(db, sessionId, nodeId)),
    removeNode: (sessionId, nodeId) => mutate((db) => removeNodeFromSession(db, sessionId, nodeId)),

    addLocation: (name) => mutate(async (db) => { await createLocation(db, name); }),
    removeLocation: (id) => mutate((db) => deleteLocation(db, id)),
  };
});
