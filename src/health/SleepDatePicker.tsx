import { useEffect, useRef, useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { localDateKey } from '../db/queries/planner/util';

interface SleepDatePickerProps {
  /** Local YYYY-MM-DD. */
  value: string;
  onChange: (dateKey: string) => void;
  /** Why a day can't be picked ("future", "already logged"), or null when it can. */
  disabledReason: (dateKey: string) => string | null;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const WEEKS_SHOWN = 6;

/** The 6×7 grid of dates for a month, Sunday first, padded with the neighbouring months' days. */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  return Array.from({ length: WEEKS_SHOWN * 7 }, (_, index) => new Date(year, month, 1 - first.getDay() + index));
}

const fromKey = (dateKey: string): Date => new Date(`${dateKey}T12:00:00`);

/** A date button that opens a month calendar (Mycelium's log-entry picker): Sunday-first
 *  weeks, today ringed, the picked day filled, and days that can't be chosen dimmed. */
export function SleepDatePicker({ value, onChange, disabledReason }: SleepDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shown, setShown] = useState(() => ({ year: fromKey(value).getFullYear(), month: fromKey(value).getMonth() }));
  const wrapperRef = useRef<HTMLDivElement>(null);
  const today = localDateKey();

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    // Capture + stopPropagation, so Escape closes only the calendar, not the dialog behind it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setIsOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [isOpen]);

  function toggle() {
    if (!isOpen) setShown({ year: fromKey(value).getFullYear(), month: fromKey(value).getMonth() });
    setIsOpen((open) => !open);
  }

  function step(delta: number) {
    const next = new Date(shown.year, shown.month + delta, 1);
    setShown({ year: next.getFullYear(), month: next.getMonth() });
  }

  const caption = new Date(shown.year, shown.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isLastMonth = shown.year === fromKey(today).getFullYear() && shown.month === fromKey(today).getMonth();

  return (
    <div ref={wrapperRef} className="relative self-start">
      <button
        type="button"
        onClick={toggle}
        className={`rounded-tab border px-3 py-1.5 text-fg-prominent transition-colors duration-panel ease-panel ${isOpen ? 'border-border-strong bg-border-subtle' : 'border-border-subtle hover:border-border-strong'}`}
      >
        {fromKey(value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 w-[264px] rounded-tab border border-border bg-bg p-2" style={{ boxShadow: 'var(--shadow-float)' }}>
          <div className="mb-1 flex items-center justify-between">
            <button type="button" aria-label="previous month" onClick={() => step(-1)} className="rounded-tab p-1.5 text-fg-muted hover:bg-border-subtle hover:text-fg-prominent">
              <CaretLeft size={12} />
            </button>
            <span className="text-fg-prominent">{caption}</span>
            <button
              type="button"
              aria-label="next month"
              disabled={isLastMonth}
              onClick={() => step(1)}
              className="rounded-tab p-1.5 text-fg-muted enabled:hover:bg-border-subtle enabled:hover:text-fg-prominent disabled:opacity-30"
            >
              <CaretRight size={12} />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-fg-faint" style={{ fontSize: '0.72rem' }}>
            {WEEKDAYS.map((weekday) => <span key={weekday} className="py-1">{weekday}</span>)}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {monthGrid(shown.year, shown.month).map((date) => {
              const key = localDateKey(date);
              const reason = disabledReason(key);
              const isSelected = key === value;
              const isOutside = date.getMonth() !== shown.month;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={reason !== null}
                  title={reason ?? undefined}
                  aria-pressed={isSelected}
                  onClick={() => {
                    onChange(key);
                    setIsOpen(false);
                  }}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-tab transition-colors duration-panel ease-panel disabled:cursor-not-allowed disabled:opacity-30 ${
                    isSelected ? 'text-black' : isOutside ? 'text-fg-faint enabled:hover:bg-border-subtle' : 'text-fg-prominent enabled:hover:bg-border-subtle'
                  }`}
                  style={{
                    fontSize: '0.8rem',
                    background: isSelected ? 'var(--accent-link)' : undefined,
                    boxShadow: key === today && !isSelected ? 'inset 0 0 0 1px var(--fg-faint)' : undefined,
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
