import { create } from 'zustand';
import type Database from '@tauri-apps/plugin-sql';
import { getHealthDb } from '../db/healthClient';
import { addSleepEntry, deleteSleepEntry, getActiveTarget, listSleepEntries, updateSleepEntry } from '../db/queries/health/sleep';
import type { SleepEntry, SleepEntryInput, SleepTarget } from '../db/queries/health/types';

interface SleepData {
  /** Main sleeps, newest night first. */
  entries: SleepEntry[];
  /** Null until one is set. */
  target: SleepTarget | null;
}

/** The night just logged or edited, so the clock strip can pan to it. `seq` changes every time, even for the same night. */
export interface LoggedNight {
  seq: number;
  startMs: number;
  endMs: number;
}

interface SleepState extends SleepData {
  lastLogged: LoggedNight | null;
  vaultRoot: string | null;
  isLoaded: boolean;
  /** Message from the last failed database call; the Health view shows it until dismissed. */
  error: string | null;

  load: (vaultRoot: string) => Promise<void>;
  dismissError: () => void;

  addEntry: (input: SleepEntryInput) => Promise<void>;
  updateEntry: (id: number, input: SleepEntryInput) => Promise<void>;
  deleteEntry: (id: number) => Promise<void>;
}

const EMPTY_DATA: SleepData = { entries: [], target: null };

async function fetchAll(db: Database): Promise<SleepData> {
  const [entries, target] = await Promise.all([listSleepEntries(db), getActiveTarget(db)]);
  return { entries, target };
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const useSleepStore = create<SleepState>((set, get) => {
  /** Runs a database change, then reloads. `night` (the saved times) makes the clock strip pan to it. A failure is stored in `error`. */
  async function mutate(work: (db: Database) => Promise<void>, night?: SleepEntryInput): Promise<void> {
    const { vaultRoot } = get();
    if (!vaultRoot) {
      set({ error: 'The health data is not loaded yet.' });
      return;
    }
    try {
      const db = await getHealthDb(vaultRoot);
      await work(db);
      const data = await fetchAll(db);
      set((state) => ({
        ...data,
        ...(night && { lastLogged: { seq: (state.lastLogged?.seq ?? 0) + 1, startMs: Date.parse(night.sleepStart), endMs: Date.parse(night.wakeTime) } }),
      }));
    } catch (error) {
      set({ error: messageOf(error) });
    }
  }

  return {
    ...EMPTY_DATA,
    lastLogged: null,
    vaultRoot: null,
    isLoaded: false,
    error: null,

    load: async (vaultRoot) => {
      set({ vaultRoot, isLoaded: false, error: null });
      try {
        set({ ...(await fetchAll(await getHealthDb(vaultRoot))), isLoaded: true });
      } catch (error) {
        set({ error: messageOf(error), isLoaded: true });
      }
    },
    dismissError: () => set({ error: null }),

    addEntry: (input) => mutate((db) => addSleepEntry(db, input), input),
    updateEntry: (id, input) => mutate((db) => updateSleepEntry(db, id, input), input),
    deleteEntry: (id) => mutate((db) => deleteSleepEntry(db, id)),
  };
});
