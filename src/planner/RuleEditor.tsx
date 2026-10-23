import { CaretDown, X } from '@phosphor-icons/react';
import type { RoutineRuleInput, RuleFreq } from '../db/queries/planner/types';
import { CHIP_BASE, CHIP_OFF, CHIP_ON, FIELD_CLASS } from './plannerStyles';
import { Segmented } from './Segmented';
import { DAY_SHORT, ruleLabel } from './routineDerived';

type RecurringFreq = Exclude<RuleFreq, 'manual'>;
const UNITS: readonly { value: RecurringFreq; label: string }[] = [
  { value: 'daily', label: 'days' },
  { value: 'weekly', label: 'weeks' },
  { value: 'monthly', label: 'months' },
];
const END_MODES: readonly { value: RoutineRuleInput['endMode']; label: string }[] = [
  { value: 'count', label: 'After' },
  { value: 'date', label: 'Until' },
];
const DEFAULT_END_COUNT = 52;
const MAX_DURATION_MINUTES = 480;
/** Weekday toggles run Monday first, like the calendars. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

interface RuleEditorProps {
  rule: RoutineRuleInput;
  onChange: (rule: RoutineRuleInput) => void;
  onRemove: () => void;
  /** Collapsed rules show only their summary line. */
  isOpen: boolean;
  onToggle: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr] items-center gap-x-2">
      <span className="text-fg-faint" style={{ fontSize: '0.75rem' }}>{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const SMALL_FIELD = `${FIELD_CLASS} !w-auto`;

/** One recurring rule: interval and unit, weekdays, start, end condition and time of day. */
export function RuleEditor({ rule, onChange, onRemove, isOpen, onToggle }: RuleEditorProps) {
  const set = (partial: Partial<RoutineRuleInput>) => onChange({ ...rule, ...partial });
  const toggleDay = (day: number) =>
    set({ days: rule.days.includes(day) ? rule.days.filter((d) => d !== day) : [...rule.days, day].sort() });
  const toNumber = (value: string) => (value === '' ? null : Math.max(1, Number.parseInt(value, 10) || 1));

  return (
    <div className="rounded-tab border border-border-subtle bg-bg-packet/40">
      <div className="flex items-center">
        <button type="button" aria-expanded={isOpen} onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left">
          <CaretDown size={11} className={`shrink-0 text-fg-faint transition-transform duration-panel ease-panel ${isOpen ? '' : '-rotate-90'}`} />
          <span className="min-w-0 flex-1 truncate text-fg-prominent">{ruleLabel(rule)}</span>
        </button>
        <button type="button" aria-label="remove rule" title="remove rule" onClick={onRemove} className="mr-2 rounded-tab p-1 text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent">
          <X size={12} />
        </button>
      </div>
      {isOpen && (
        <div className="flex flex-col gap-3 border-t border-border-subtle p-3">
      <Row label="Every">
        <input type="number" min={1} value={rule.repeatInterval} onChange={(e) => set({ repeatInterval: toNumber(e.target.value) ?? 1 })} className={`${FIELD_CLASS} !w-14 text-center`} />
        <Segmented
          value={rule.freq === 'manual' ? 'daily' : rule.freq}
          options={UNITS}
          onChange={(freq) => set({ freq })}
          className="min-w-0 flex-1"
        />
      </Row>

      {rule.freq === 'weekly' && (
        <Row label="On">
          <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
            {WEEK_ORDER.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={rule.days.includes(day)}
                onClick={() => toggleDay(day)}
                className={`${CHIP_BASE} py-1 text-center ${rule.days.includes(day) ? CHIP_ON : CHIP_OFF}`}
                style={{ fontSize: '0.72rem' }}
              >
                {DAY_SHORT[day].slice(0, 2)}
              </button>
            ))}
          </div>
        </Row>
      )}

      <Row label="Starts">
        <input type="date" value={rule.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} className={SMALL_FIELD} />
      </Row>

      <Row label="Ends">
        <Segmented
          value={rule.endMode}
          options={END_MODES}
          onChange={(endMode) => set(endMode === 'count' ? { endMode, endCount: rule.endCount ?? DEFAULT_END_COUNT } : { endMode })}
          className="w-36"
        />
        {rule.endMode === 'count' ? (
          <>
            <input type="number" min={1} value={rule.endCount ?? ''} onChange={(e) => set({ endCount: toNumber(e.target.value) })} className={`${FIELD_CLASS} !w-16 text-center`} />
            <span className="text-fg-faint">times</span>
          </>
        ) : (
          <input type="date" value={rule.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || null })} className={SMALL_FIELD} />
        )}
      </Row>

      <Row label="At">
        <input type="time" value={rule.startTime ?? ''} onChange={(e) => set({ startTime: e.target.value || null })} className={SMALL_FIELD} />
        <input type="number" min={5} max={MAX_DURATION_MINUTES} placeholder="—" value={rule.durationMinutes ?? ''} onChange={(e) => set({ durationMinutes: toNumber(e.target.value) })} className={`${FIELD_CLASS} !w-16 text-center`} />
        <span className="text-fg-faint">min</span>
      </Row>
        </div>
      )}
    </div>
  );
}
