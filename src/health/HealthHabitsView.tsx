import { useState } from 'react';
import { CaretLeft, CaretRight, Heartbeat, Moon, Plus } from '@phosphor-icons/react';
import { localDateKey } from '../db/queries/planner/util';
import type { Habit, HabitInput, SleepEntry } from '../db/queries/health/types';
import { HabitForm } from './HabitForm';
import { HabitGrid } from './HabitGrid';
import { SleepEntryDialog } from './SleepEntryDialog';
import { SleepLogView } from './SleepLogView';
import { useHabitStore } from './habitStore';
import { useSleepStore } from './sleepStore';

const HEALTH_PINK = '#ec4899';

const ACTION_BUTTON =
  'flex items-center gap-1.5 rounded-tab border border-border-subtle px-3 py-1.5 text-fg-muted transition-colors duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent';

type HealthTab = 'habits' | 'sleep';
const TABS: readonly { id: HealthTab; label: string }[] = [
  { id: 'habits', label: 'Habits' },
  { id: 'sleep', label: 'Sleep log' },
];

type HabitFormState = { habit?: Habit } | null;
/** `entry` set edits that night; unset logs a new one. */
type SleepDialogState = { entry?: SleepEntry } | null;

/** Content-area view behind the sidebar's "Health & habits" row, over health.sqlite:
 *  a Habits tab (month grid with a read-only sleep row, goals and progress) and a
 *  Sleep log tab (every night, editable and deletable). */
export function HealthHabitsView() {
  const now = new Date();
  const [tab, setTab] = useState<HealthTab>('habits');
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [habitForm, setHabitForm] = useState<HabitFormState>(null);
  const [sleepDialog, setSleepDialog] = useState<SleepDialogState>(null);
  const addSleepEntry = useSleepStore((state) => state.addEntry);
  const updateSleepEntry = useSleepStore((state) => state.updateEntry);
  const createHabit = useHabitStore((state) => state.createHabit);
  const updateHabit = useHabitStore((state) => state.updateHabit);
  const isLoaded = useHabitStore((state) => state.isLoaded);
  const habitError = useHabitStore((state) => state.error);
  const dismissHabitError = useHabitStore((state) => state.dismissError);
  const sleepError = useSleepStore((state) => state.error);
  const dismissSleepError = useSleepStore((state) => state.dismissError);

  const today = localDateKey();
  const monthLabel = new Date(view.year, view.month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const stepMonth = (delta: number) => {
    const next = new Date(view.year, view.month - 1 + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };

  function saveHabit(input: HabitInput) {
    if (habitForm?.habit) void updateHabit(habitForm.habit.id, input);
    else void createHabit(input);
    setHabitForm(null);
  }

  function saveSleep(input: Parameters<typeof addSleepEntry>[0]) {
    if (sleepDialog?.entry) void updateSleepEntry(sleepDialog.entry.id, input);
    else void addSleepEntry(input);
    setSleepDialog(null);
  }

  return (
    <div className="h-full overflow-auto px-8 py-6" style={{ fontSize: '0.85rem' }}>
      <div className="mx-auto flex w-fit max-w-full flex-col gap-5">
        <div className="flex items-center justify-between gap-6">
          <h1 className="flex items-center gap-2 font-semibold text-fg-prominent" style={{ fontSize: '1rem' }}>
            <Heartbeat size={18} style={{ color: HEALTH_PINK }} />
            Health &amp; habits
          </h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSleepDialog({})} className={ACTION_BUTTON}>
              <Moon size={14} />
              Log sleep
            </button>
            {tab === 'habits' && (
              <button type="button" onClick={() => setHabitForm({})} className={ACTION_BUTTON}>
                <Plus size={14} />
                New habit
              </button>
            )}
          </div>
        </div>

        <nav className="flex gap-1.5">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-tab border px-3 py-1 transition-colors duration-panel ease-panel ${
                tab === id ? 'border-border-strong bg-border-subtle text-fg-prominent' : 'border-border-subtle text-fg-muted hover:text-fg-prominent'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {[{ message: habitError, dismiss: dismissHabitError }, { message: sleepError, dismiss: dismissSleepError }].map(
          ({ message, dismiss }) => message && (
            <div key={message} role="alert" className="flex items-start gap-3 rounded-tab border border-accent-link-broken px-3 py-2 text-accent-link-broken">
              <span className="min-w-0 flex-1">{message}</span>
              <button type="button" onClick={dismiss} className="shrink-0 hover:text-fg-prominent">dismiss</button>
            </div>
          ),
        )}

        {!isLoaded ? (
          <p className="text-fg-faint">Loading…</p>
        ) : tab === 'sleep' ? (
          <SleepLogView onEdit={(entry) => setSleepDialog({ entry })} />
        ) : (
          <>
            <div className="flex items-center justify-center gap-2">
              <button type="button" aria-label="previous month" onClick={() => stepMonth(-1)} className="text-fg-faint hover:text-fg-prominent"><CaretLeft size={14} /></button>
              <span className="min-w-[10rem] text-center text-fg-prominent" style={{ fontSize: '0.95rem' }}>{monthLabel}</span>
              <button type="button" aria-label="next month" onClick={() => stepMonth(1)} className="text-fg-faint hover:text-fg-prominent"><CaretRight size={14} /></button>
            </div>
            <div className="overflow-x-auto">
              <HabitGrid year={view.year} month={view.month} today={today} onEdit={(habit) => setHabitForm({ habit })} />
            </div>
          </>
        )}
      </div>

      {sleepDialog && <SleepEntryDialog initial={sleepDialog.entry} onSave={saveSleep} onClose={() => setSleepDialog(null)} />}
      {habitForm && <HabitForm initial={habitForm.habit} onSave={saveHabit} onClose={() => setHabitForm(null)} />}
    </div>
  );
}
