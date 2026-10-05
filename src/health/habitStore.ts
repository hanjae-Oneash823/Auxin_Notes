import { create } from 'zustand';
import type Database from '@tauri-apps/plugin-sql';
import { getHealthDb } from '../db/healthClient';
import { archiveHabit, createHabit, listHabits, listLogs, setNumericLog, toggleBooleanLog, updateHabit } from '../db/queries/health/habits';
import type { Habit, HabitInput, HabitLog } from '../db/queries/health/types';

interface HabitData {
  habits: Habit[];
  /** Every log, all months: the grid filters by the month it shows. */
  logs: HabitLog[];
}

interface HabitState extends HabitData {
  vaultRoot: string | null;
  isLoaded: boolean;
  /** Message from the last failed database call; the Health view shows it until dismissed. */
  error: string | null;

  load: (vaultRoot: string) => Promise<void>;
  dismissError: () => void;

  createHabit: (input: HabitInput) => Promise<void>;
  updateHabit: (id: string, input: HabitInput) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  toggleBoolean: (habitId: string, date: string) => Promise<void>;
  /** null clears the day. */
  setNumeric: (habitId: string, date: string, value: number | null) => Promise<void>;
}

const EMPTY_DATA: HabitData = { habits: [], logs: [] };

async function fetchAll(db: Database): Promise<HabitData> {
  const [habits, logs] = await Promise.all([listHabits(db), listLogs(db)]);
  return { habits, logs };
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const useHabitStore = create<HabitState>((set, get) => {
  /** Runs a database change, then reloads. A failure is stored in `error` for the UI instead of being dropped. */
  async function mutate(work: (db: Database) => Promise<unknown>): Promise<void> {
    const { vaultRoot } = get();
    if (!vaultRoot) {
      set({ error: 'The health data is not loaded yet.' });
      return;
    }
    try {
      const db = await getHealthDb(vaultRoot);
      await work(db);
      set(await fetchAll(db));
    } catch (error) {
      set({ error: messageOf(error) });
    }
  }

  return {
    ...EMPTY_DATA,
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

    createHabit: (input) => mutate((db) => createHabit(db, input)),
    updateHabit: (id, input) => mutate((db) => updateHabit(db, id, input)),
    archiveHabit: (id) => mutate((db) => archiveHabit(db, id)),
    toggleBoolean: (habitId, date) => mutate((db) => toggleBooleanLog(db, habitId, date)),
    setNumeric: (habitId, date, value) => mutate((db) => setNumericLog(db, habitId, date, value)),
  };
});
