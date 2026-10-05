import { useEffect, useState } from 'react';
import { CHIP_BASE, CHIP_OFF, CHIP_ON, FIELD_CLASS } from '../planner/plannerStyles';
import type { BooleanGoalType, GoalType, Habit, HabitInput, HabitValueType, NumericGoalType } from '../db/queries/health/types';

const PRESET_COLORS = ['#e05555', '#e07d40', '#d4b84a', '#7ec450', '#4ec48a', '#40c4c4', '#4d8fe0', '#7060e0', '#a070e0', '#e060a0'];

interface GoalOption<T extends GoalType> {
  type: T;
  label: string;
  /** Placeholder for the number the goal needs; absent when it needs none. */
  valueHint?: string;
}

const BOOLEAN_GOALS: readonly GoalOption<BooleanGoalType>[] = [
  { type: 'every_day', label: 'every day' },
  { type: 'times_per_month', label: '× / month', valueHint: 'times' },
  { type: 'times_per_week', label: '× / week', valueHint: 'days' },
  { type: 'none', label: 'no goal' },
];

const NUMERIC_GOALS: readonly GoalOption<NumericGoalType>[] = [
  { type: 'at_least_per_day', label: '≥ / day', valueHint: 'min' },
  { type: 'at_most_per_day', label: '≤ / day', valueHint: 'max' },
  { type: 'monthly_total', label: 'total / month', valueHint: 'total' },
  { type: 'none', label: 'no goal' },
];

interface HabitFormProps {
  /** The habit being edited; undefined creates a new one. */
  initial?: Habit;
  onSave: (input: HabitInput) => void;
  onClose: () => void;
}

/** New-habit / edit-habit dialog: name, color, yes/no or number, and the goal. */
export function HabitForm({ initial, onSave, onClose }: HabitFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[5]);
  const [valueType, setValueType] = useState<HabitValueType>(initial?.valueType ?? 'boolean');
  const [goalType, setGoalType] = useState<GoalType>(initial?.goalType ?? 'none');
  const [goalValue, setGoalValue] = useState(initial?.goalValue?.toString() ?? '');

  const goals: readonly GoalOption<GoalType>[] = valueType === 'boolean' ? BOOLEAN_GOALS : NUMERIC_GOALS;
  const valueHint = goals.find((goal) => goal.type === goalType)?.valueHint;
  const parsedValue = parseFloat(goalValue);
  const canSave = name.trim() !== '' && (!valueHint || parsedValue > 0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function pickType(next: HabitValueType) {
    setValueType(next);
    setGoalType('none');
    setGoalValue('');
  }

  function submit() {
    if (!canSave) return;
    onSave({ name: name.trim(), color, valueType, goalType, goalValue: valueHint ? parsedValue : null });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={initial ? 'Edit habit' : 'New habit'}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex w-[440px] max-w-[92vw] flex-col gap-3 rounded-tab border border-border bg-bg p-4"
        style={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem' }}
      >
        <h2 className="font-semibold text-fg-prominent" style={{ fontSize: '0.95rem' }}>{initial ? 'Edit habit' : 'New habit'}</h2>

        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="Habit name" className={FIELD_CLASS} />

        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`color ${preset}`}
              onClick={() => setColor(preset)}
              className="h-5 w-5 rounded-full border"
              style={{ background: preset, borderColor: preset === color ? 'var(--fg-prominent)' : 'transparent' }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-12 text-fg-muted">tracks</span>
          {(['boolean', 'numeric'] as const).map((type) => (
            <button key={type} type="button" onClick={() => pickType(type)} className={`${CHIP_BASE} ${valueType === type ? CHIP_ON : CHIP_OFF}`}>
              {type === 'boolean' ? 'done / not done' : 'a number'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 text-fg-muted">goal</span>
          {goals.map((goal) => (
            <button key={goal.type} type="button" onClick={() => { setGoalType(goal.type); setGoalValue(''); }} className={`${CHIP_BASE} ${goalType === goal.type ? CHIP_ON : CHIP_OFF}`}>
              {goal.label}
            </button>
          ))}
          {valueHint && (
            <input type="number" min={1} value={goalValue} onChange={(event) => setGoalValue(event.target.value)} placeholder={valueHint} className={`${FIELD_CLASS} !w-20`} />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={`${CHIP_BASE} ${CHIP_OFF} px-3 py-1`}>Cancel</button>
          <button type="button" onClick={submit} disabled={!canSave} className={`${CHIP_BASE} ${CHIP_ON} px-3 py-1 disabled:opacity-40`}>Save</button>
        </div>
      </div>
    </div>
  );
}
