import { useEffect, useState } from 'react';
import { localDateKey } from '../db/queries/planner/util';
import type { SleepEntry, SleepEntryInput } from '../db/queries/health/types';
import { CHIP_BASE, CHIP_OFF, CHIP_ON, FIELD_CLASS } from '../planner/plannerStyles';
import { SleepDatePicker } from './SleepDatePicker';
import { SleepTimeBar, type BarSelection } from './SleepTimeBar';
import { useSleepStore } from './sleepStore';
import { addDays, buildNight, clockOf, hhmmToPos, posToHHMM } from './sleepTime';

/** Before this hour you're most likely logging last night, so the evening date defaults to yesterday. */
const LOGGING_LAST_NIGHT_BEFORE_HOUR = 14;

interface SleepEntryDialogProps {
  /** The night being edited; undefined logs a new one. */
  initial?: SleepEntry;
  onSave: (input: SleepEntryInput) => void;
  onClose: () => void;
}

/** The bar selection for a saved night, or null when its times fall outside the bar's 22:00–12:00. */
function selectionOf(entry: SleepEntry | undefined): BarSelection | null {
  if (!entry) return null;
  const start = hhmmToPos(clockOf(entry.sleepStart));
  const end = hhmmToPos(clockOf(entry.wakeTime));
  return start !== null && end !== null && end > start ? { start, end } : null;
}

/** Log or edit one night: the evening it began (picked on a calendar that blocks future and
 *  already-logged days), a drag on the time bar for bedtime and wake time, and optional notes. */
export function SleepEntryDialog({ initial, onSave, onClose }: SleepEntryDialogProps) {
  const entries = useSleepStore((state) => state.entries);
  const today = localDateKey();
  const [date, setDate] = useState(() => initial?.date ?? (new Date().getHours() < LOGGING_LAST_NIGHT_BEFORE_HOUR ? addDays(today, -1) : today));
  const [selection, setSelection] = useState<BarSelection | null>(() => selectionOf(initial));
  const [notes, setNotes] = useState(initial?.notes ?? '');

  /** Other nights' dates; the one being edited may keep its own. */
  const loggedDates = new Set(entries.filter((entry) => entry.id !== initial?.id).map((entry) => entry.date));
  const disabledReason = (dateKey: string): string | null => (dateKey > today ? 'in the future' : loggedDates.has(dateKey) ? 'already logged' : null);
  const canSave = disabledReason(date) === null && selection !== null;
  const hasOffBarTimes = initial !== undefined && selection === null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submit() {
    if (!canSave || !selection) return;
    onSave({ date, ...buildNight(date, posToHHMM(selection.start), posToHHMM(selection.end)), notes: notes.trim() });
  }

  const title = initial ? 'Edit sleep' : 'Log sleep';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex w-[520px] max-w-[92vw] flex-col gap-4 rounded-tab border border-border bg-bg p-4"
        style={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem' }}
      >
        <h2 className="font-semibold text-fg-prominent" style={{ fontSize: '0.95rem' }}>{title}</h2>

        <div className="flex flex-col gap-1 text-fg-muted">
          Night of (the evening you went to bed)
          <SleepDatePicker value={date} onChange={setDate} disabledReason={disabledReason} />
        </div>

        <div className="flex flex-col gap-1 text-fg-muted">
          Asleep → awake
          <SleepTimeBar value={selection} onChange={setSelection} />
          {hasOffBarTimes && <span className="text-accent-warning" style={{ fontSize: '0.78rem' }}>This night's times are outside the bar (22:00–12:00). Drag to set them again.</span>}
        </div>

        <label className="flex flex-col gap-1 text-fg-muted">
          Notes (optional)
          <input value={notes} onChange={(event) => setNotes(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="…" className={FIELD_CLASS} />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`${CHIP_BASE} ${CHIP_OFF} px-3 py-1`}>Cancel</button>
          <button type="button" onClick={submit} disabled={!canSave} className={`${CHIP_BASE} ${CHIP_ON} px-3 py-1 disabled:opacity-40`}>Save</button>
        </div>
      </div>
    </div>
  );
}
