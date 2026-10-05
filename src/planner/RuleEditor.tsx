import type { RoutineRuleInput, RuleFreq } from '../db/queries/planner/types';
import { CHIP_BASE, CHIP_OFF, CHIP_ON, FIELD_CLASS } from './plannerStyles';
import { DAY_SHORT, ruleLabel } from './routineDerived';

const RECURRING: readonly { freq: Exclude<RuleFreq, 'manual'>; unit: string }[] = [
  { freq: 'daily', unit: 'days' },
  { freq: 'weekly', unit: 'weeks' },
  { freq: 'monthly', unit: 'months' },
];
const DEFAULT_END_COUNT = 52;

interface RuleEditorProps {
  rule: RoutineRuleInput;
  onChange: (rule: RoutineRuleInput) => void;
  onRemove: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 shrink-0 text-fg-faint" style={{ fontSize: '0.72rem' }}>{label}</span>
      {children}
    </div>
  );
}

const SMALL_FIELD = `${FIELD_CLASS} !w-auto`;

/** One recurring rule: frequency + interval, weekdays, start, end condition and time of day. */
export function RuleEditor({ rule, onChange, onRemove }: RuleEditorProps) {
  const set = (partial: Partial<RoutineRuleInput>) => onChange({ ...rule, ...partial });
  const toggleDay = (day: number) =>
    set({ days: rule.days.includes(day) ? rule.days.filter((d) => d !== day) : [...rule.days, day].sort() });
  const toNumber = (value: string) => (value === '' ? null : Math.max(1, Number.parseInt(value, 10) || 1));

  return (
    <div className="flex flex-col gap-2 rounded-tab border border-border-subtle p-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-fg-faint" style={{ fontSize: '0.72rem' }}>{ruleLabel(rule)}</span>
        <button type="button" aria-label="remove rule" onClick={onRemove} className="text-fg-faint hover:text-fg-prominent">×</button>
      </div>

      <Row label="every">
        <input type="number" min={1} value={rule.repeatInterval} onChange={(e) => set({ repeatInterval: toNumber(e.target.value) ?? 1 })} className={`${SMALL_FIELD} w-16`} />
        {RECURRING.map(({ freq, unit }) => (
          <button key={freq} type="button" onClick={() => set({ freq })} className={`${CHIP_BASE} ${rule.freq === freq ? CHIP_ON : CHIP_OFF}`}>{unit}</button>
        ))}
      </Row>

      {rule.freq === 'weekly' && (
        <Row label="on">
          {DAY_SHORT.map((name, day) => (
            <button key={name} type="button" onClick={() => toggleDay(day)} className={`${CHIP_BASE} ${rule.days.includes(day) ? CHIP_ON : CHIP_OFF}`} style={{ fontSize: '0.72rem' }}>{name}</button>
          ))}
        </Row>
      )}

      <Row label="starts">
        <input type="date" value={rule.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} className={SMALL_FIELD} />
      </Row>

      <Row label="ends">
        <button type="button" onClick={() => set({ endMode: 'count', endCount: rule.endCount ?? DEFAULT_END_COUNT })} className={`${CHIP_BASE} ${rule.endMode === 'count' ? CHIP_ON : CHIP_OFF}`}>after</button>
        {rule.endMode === 'count' && (
          <>
            <input type="number" min={1} value={rule.endCount ?? ''} onChange={(e) => set({ endCount: toNumber(e.target.value) })} className={`${SMALL_FIELD} w-16`} />
            <span className="text-fg-faint">times</span>
          </>
        )}
        <button type="button" onClick={() => set({ endMode: 'date' })} className={`${CHIP_BASE} ${rule.endMode === 'date' ? CHIP_ON : CHIP_OFF}`}>by date</button>
        {rule.endMode === 'date' && <input type="date" value={rule.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || null })} className={SMALL_FIELD} />}
      </Row>

      <Row label="at">
        <input type="time" value={rule.startTime ?? ''} onChange={(e) => set({ startTime: e.target.value || null })} className={SMALL_FIELD} />
        <input type="number" min={5} max={480} placeholder="min" value={rule.durationMinutes ?? ''} onChange={(e) => set({ durationMinutes: toNumber(e.target.value) })} className={`${SMALL_FIELD} w-20`} />
      </Row>
    </div>
  );
}
