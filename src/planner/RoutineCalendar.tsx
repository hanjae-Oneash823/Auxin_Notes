import { CaretLeft, CaretRight } from '@phosphor-icons/react';

const FIXED_COLOR = '#00c4a7';
const MANUAL_COLOR = '#64c8ff';
const EXCEPTION_COLOR = '#ef4444';
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

const toKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

interface RoutineCalendarProps {
  /** Any date inside the month to show. */
  month: Date;
  onMonthChange: (month: Date) => void;
  fixed: ReadonlySet<string>;
  manual: ReadonlySet<string>;
  exceptions: ReadonlySet<string>;
  /** Click a recurring date to skip it (or restore a skipped one). */
  onToggleException: (date: string) => void;
}

/** Month preview of a routine's occurrences: recurring (teal), manual (blue), skipped (red). */
export function RoutineCalendar({ month, onMonthChange, fixed, manual, exceptions, onToggleException }: RoutineCalendarProps) {
  const year = month.getFullYear();
  const index = month.getMonth();
  const leading = new Date(year, index, 1).getDay();
  const length = new Date(year, index + 1, 0).getDate();
  const shift = (delta: number) => onMonthChange(new Date(year, index + delta, 1));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="previous month" onClick={() => shift(-1)} className="text-fg-faint hover:text-fg-prominent"><CaretLeft size={12} /></button>
        <span className="text-fg-prominent">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button type="button" aria-label="next month" onClick={() => shift(1)} className="text-fg-faint hover:text-fg-prominent"><CaretRight size={12} /></button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center" style={{ fontSize: '0.72rem' }}>
        {DOW.map((letter, i) => <span key={i} className="text-fg-faint">{letter}</span>)}
        {Array.from({ length: leading }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length }, (_, i) => {
          const key = toKey(year, index, i + 1);
          const isSkipped = exceptions.has(key);
          const isFixed = fixed.has(key);
          const isManual = manual.has(key);
          const canToggle = isFixed || isSkipped;
          const background = isSkipped ? 'transparent' : isFixed ? `${FIXED_COLOR}33` : isManual ? `${MANUAL_COLOR}33` : 'transparent';
          const color = isSkipped ? EXCEPTION_COLOR : isFixed ? FIXED_COLOR : isManual ? MANUAL_COLOR : undefined;
          return (
            <button
              key={key}
              type="button"
              disabled={!canToggle}
              onClick={() => onToggleException(key)}
              title={isSkipped ? 'skipped — click to restore' : isFixed ? 'click to skip' : isManual ? 'manual' : undefined}
              className={`rounded-row py-1 ${color ? '' : 'text-fg-faint'} ${isSkipped ? 'line-through' : ''}`}
              style={{ background, color, border: isSkipped ? `1px solid ${EXCEPTION_COLOR}66` : '1px solid transparent' }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 text-fg-faint" style={{ fontSize: '0.68rem' }}>
        <span><span style={{ color: FIXED_COLOR }}>■</span> recurring</span>
        <span><span style={{ color: MANUAL_COLOR }}>■</span> manual</span>
        <span><span style={{ color: EXCEPTION_COLOR }}>■</span> skipped</span>
      </div>
    </div>
  );
}
