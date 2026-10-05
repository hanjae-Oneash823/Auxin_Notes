import { useState } from 'react';
import type { SleepEntry } from '../db/queries/health/types';
import { SLEEP_COLOR } from './habitLayout';
import { useSleepStore } from './sleepStore';
import { clockOf, durationHours, formatHours, isLateBedtime, weekdayOf } from './sleepTime';

const PAGE_SIZE = 60;

interface SleepLogViewProps {
  onEdit: (entry: SleepEntry) => void;
}

/** Every logged night, newest first. Click one to see its notes and edit or delete it. */
export function SleepLogView({ onEdit }: SleepLogViewProps) {
  const entries = useSleepStore((state) => state.entries);
  const target = useSleepStore((state) => state.target);
  const deleteEntry = useSleepStore((state) => state.deleteEntry);
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (entries.length === 0) return <p className="text-fg-faint">No nights logged yet — use “Log sleep” to add one.</p>;

  return (
    <div className="flex w-[760px] max-w-full flex-col">
      {entries.slice(0, visibleCount).map((entry) => {
        const hours = durationHours(entry);
        const isShort = target !== null && hours < target.targetDuration;
        const isLate = target !== null && isLateBedtime(clockOf(entry.sleepStart), target.targetSleepStart);
        const isOpen = openId === entry.id;
        return (
          <div key={entry.id} className={`border-b border-border-subtle ${isOpen ? 'bg-border-subtle' : ''}`}>
            <button
              type="button"
              onClick={() => { setOpenId(isOpen ? null : entry.id); setConfirmingId(null); }}
              className="flex w-full items-baseline gap-4 px-3 py-2 text-left transition-colors duration-panel ease-panel hover:bg-border-subtle"
            >
              <span className="w-[5.5rem] shrink-0 text-fg-muted">{entry.date}</span>
              <span className="w-8 shrink-0 text-fg-faint">{weekdayOf(entry.date)}</span>
              <span className="text-fg-prominent">{clockOf(entry.sleepStart)} → {clockOf(entry.wakeTime)}</span>
              <span style={{ color: SLEEP_COLOR }}>[{formatHours(hours)}]</span>
              {isShort && <span className="text-accent-link-broken" style={{ fontSize: '0.78rem' }}>↓ short</span>}
              {isLate && <span className="text-accent-warning" style={{ fontSize: '0.78rem' }}>↑ late</span>}
            </button>

            {isOpen && (
              <div className="flex items-center gap-4 px-3 pb-2 pl-[8.5rem]">
                <span className={`min-w-0 flex-1 ${entry.notes ? 'text-fg-muted' : 'text-fg-faint'}`}>{entry.notes || 'no notes'}</span>
                <button type="button" onClick={() => onEdit(entry)} className="text-fg-muted hover:text-fg-prominent">edit</button>
                <button
                  type="button"
                  onClick={() => (confirmingId === entry.id ? void deleteEntry(entry.id) : setConfirmingId(entry.id))}
                  className="text-accent-link-broken hover:text-fg-prominent"
                >
                  {confirmingId === entry.id ? 'confirm delete?' : 'delete'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {entries.length > visibleCount && (
        <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="self-start px-3 py-2 text-fg-muted hover:text-fg-prominent">
          show more ({entries.length - visibleCount} older)
        </button>
      )}
    </div>
  );
}
