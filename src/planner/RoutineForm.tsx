import { Star, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { ruleOccurrenceDates } from '../db/queries/planner/occurrences';
import type { Importance, NodeType, Routine, RoutineRuleInput } from '../db/queries/planner/types';
import type { RoutineFields } from '../db/queries/planner/routines';
import { RoutineCalendar } from './RoutineCalendar';
import { PlannerSelect } from './PlannerSelect';
import { RuleEditor } from './RuleEditor';
import { Segmented } from './Segmented';
import { offsetDateKey, todayKey } from './nodeDerived';
import { usePlannerStore } from './plannerStore';
import { CHIP_BASE, CHIP_OFF, CHIP_ON, FIELD_CLASS } from './plannerStyles';
import { manualRuleInput, newRuleInput, timeRange } from './routineDerived';

const UPCOMING_LIMIT = 6;
const HORIZON_DAYS = 60;
const MANUAL_COLOR = '#64c8ff';
const NODE_TYPES: readonly { value: NodeType; label: string; title: string }[] = [
  { value: 'task', label: 'Task', title: 'flexible · recurring work' },
  { value: 'event', label: 'Event', title: 'scheduled at a specific time' },
];

/** A rule being edited, with a stable key for React (stored rules have no id until saved). */
type EditableRule = RoutineRuleInput & { key: string };

const editable = (rule: RoutineRuleInput): EditableRule => ({ ...rule, key: crypto.randomUUID() });
const stripKey = ({ key: _key, ...rule }: EditableRule): RoutineRuleInput => rule;
const rawDates = (rule: RoutineRuleInput) => ruleOccurrenceDates({ ...rule, exceptions: [] });
const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface RoutineFormProps {
  initial: Routine | null;
  onSave: (id: string | null, fields: RoutineFields) => void;
  onCancel: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 last:border-b-0">
      <h3 className="font-medium text-fg-muted" style={{ fontSize: '0.8rem' }}>{title}</h3>
      {children}
    </section>
  );
}

/** Routine editor: the name and importance in a header, then details, the recurrence rules, a calendar
 *  preview (click a date to skip it) with the next occurrences, and one-off dates. */
export function RoutineForm({ initial, onSave, onCancel }: RoutineFormProps) {
  const arcs = usePlannerStore((state) => state.arcs).filter((arc) => arc.status === 'active' || arc.id === initial?.arcId);
  const allProjects = usePlannerStore((state) => state.projects).filter((p) => p.status === 'active' || p.id === initial?.projectId);
  const groups = usePlannerStore((state) => state.groups).filter((group) => !group.isUngrouped);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [nodeType, setNodeType] = useState<NodeType>(initial?.nodeType ?? 'task');
  const [arcId, setArcId] = useState(initial?.arcId ?? '');
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [isImportant, setIsImportant] = useState(initial?.importanceLevel === 1);
  const [groupIds, setGroupIds] = useState<readonly string[]>(initial?.groupIds ?? []);
  const [rules, setRules] = useState<readonly EditableRule[]>(() =>
    initial ? initial.rules.filter((r) => r.freq !== 'manual').map(editable) : [editable(newRuleInput())],
  );
  const [manual, setManual] = useState<readonly EditableRule[]>(() => (initial?.rules ?? []).filter((r) => r.freq === 'manual').map(editable));
  const [exceptions, setExceptions] = useState<ReadonlySet<string>>(
    () => new Set((initial?.rules ?? []).flatMap((r) => (r.freq === 'manual' ? [] : r.exceptions))),
  );
  /** The one rule open for editing; the rest show a summary line. A new routine starts with its only rule open. */
  const [openRuleKey, setOpenRuleKey] = useState<string | null>(() => (initial ? null : rules[0]?.key ?? null));
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const { fixedDates, manualDates } = useMemo(() => {
    const first = toKey(new Date(month.getFullYear(), month.getMonth(), 1));
    const last = toKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    const inMonth = (key: string) => key >= first && key <= last;
    return {
      fixedDates: new Set(rules.flatMap(rawDates).filter(inMonth)),
      manualDates: new Set(manual.map((rule) => rule.startDate).filter(inMonth)),
    };
  }, [rules, manual, month]);

  const upcoming = useMemo(() => {
    const until = offsetDateKey(HORIZON_DAYS);
    const recurring = rules.flatMap((rule) =>
      rawDates(rule).filter((date) => date >= todayKey() && date <= until && !exceptions.has(date)).map((date) => ({ date, rule })),
    );
    const oneOff = manual.filter((rule) => rule.startDate >= todayKey()).map((rule) => ({ date: rule.startDate, rule }));
    return [...recurring, ...oneOff].sort((a, b) => a.date.localeCompare(b.date)).slice(0, UPCOMING_LIMIT);
  }, [rules, manual, exceptions]);

  const projects = allProjects.filter((p) => !arcId || p.arcId === arcId);
  const canSave = title.trim() !== '' && rules.length + manual.length > 0;

  function pickArc(id: string) {
    setArcId(id);
    if (projectId && allProjects.find((p) => p.id === projectId)?.arcId !== id) setProjectId('');
  }

  function pickProject(id: string) {
    setProjectId(id);
    const project = allProjects.find((p) => p.id === id);
    if (project?.arcId) setArcId(project.arcId);
  }

  function toggleException(date: string) {
    setExceptions((current) => {
      const next = new Set(current);
      if (!next.delete(date)) next.add(date);
      return next;
    });
  }

  function addManual() {
    if (!manualDate || manual.some((rule) => rule.startDate === manualDate)) return;
    const minutes = Number.parseInt(manualMinutes, 10);
    setManual((current) => [...current, editable(manualRuleInput(manualDate, manualTime || null, minutes > 0 ? minutes : null))]);
    setManualDate('');
  }

  function addRule() {
    const rule = editable(newRuleInput());
    setRules((cur) => [...cur, rule]);
    setOpenRuleKey(rule.key);
  }

  function save() {
    if (!canSave) return;
    // Hand each skipped date to the rule that generates it, like Mycelium does.
    const recurring = rules.map(stripKey).map((rule) => {
      const generated = new Set(rawDates(rule));
      return { ...rule, exceptions: [...exceptions].filter((date) => generated.has(date)) };
    });
    onSave(initial?.id ?? null, {
      title: title.trim(), nodeType, arcId: arcId || null, projectId: projectId || null,
      importanceLevel: (isImportant ? 1 : 0) satisfies Importance, groupIds,
      rules: [...recurring, ...manual.map(stripKey)],
    });
  }

  return (
    <div
      role="dialog"
      aria-label={initial ? 'Edit routine' : 'New routine'}
      className="flex h-full flex-col bg-bg"
      style={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem' }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Routine name"
          aria-label="Routine name"
          className="min-w-0 flex-1 bg-transparent font-semibold text-fg-prominent outline-none placeholder:text-fg-faint"
          style={{ fontSize: '1.05rem' }}
        />
        <button
          type="button"
          aria-pressed={isImportant}
          aria-label="important"
          title={isImportant ? 'important' : 'mark important'}
          onClick={() => setIsImportant((v) => !v)}
          className={`rounded-tab p-1 transition-colors duration-panel ease-panel ${isImportant ? 'text-accent-warning' : 'text-fg-faint hover:text-fg-prominent'}`}
        >
          <Star size={16} weight={isImportant ? 'fill' : 'regular'} />
        </button>
        <button type="button" aria-label="close" title="close" onClick={onCancel} className="rounded-tab p-1 text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent">
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Details">
          <Segmented value={nodeType} options={NODE_TYPES} onChange={setNodeType} />
          <div className="flex gap-2">
            <PlannerSelect
              value={arcId}
              onChange={pickArc}
              ariaLabel="Arc"
              className="min-w-0 flex-1"
              groups={[{ options: [{ value: '', label: 'No arc' }, ...arcs.map((arc) => ({ value: arc.id, label: arc.name }))] }]}
            />
            <PlannerSelect
              value={projectId}
              onChange={pickProject}
              ariaLabel="Project"
              className="min-w-0 flex-1"
              groups={[{ options: [{ value: '', label: 'No project' }, ...projects.map((project) => ({ value: project.id, label: project.name }))] }]}
            />
          </div>
          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {groups.map((group) => {
                const isOn = groupIds.includes(group.id);
                return (
                  <button key={group.id} type="button" aria-pressed={isOn} onClick={() => setGroupIds((cur) => (isOn ? cur.filter((id) => id !== group.id) : [...cur, group.id]))} className={`${CHIP_BASE} ${isOn ? CHIP_ON : CHIP_OFF}`} style={{ fontSize: '0.78rem' }}>
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: group.colorHex }} />
                    {group.name}
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Schedule">
          {rules.map((rule) => (
            <RuleEditor
              key={rule.key}
              rule={rule}
              onChange={(next) => setRules((cur) => cur.map((r) => (r.key === rule.key ? { ...next, key: rule.key } : r)))}
              onRemove={() => setRules((cur) => cur.filter((r) => r.key !== rule.key))}
              isOpen={openRuleKey === rule.key}
              onToggle={() => setOpenRuleKey((current) => (current === rule.key ? null : rule.key))}
            />
          ))}
          <button type="button" onClick={addRule} className="rounded-tab border border-dashed border-border-subtle py-1.5 text-fg-muted transition-colors duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent">+ Add rule</button>
        </Section>

        <Section title="Preview">
          <RoutineCalendar month={month} onMonthChange={setMonth} fixed={fixedDates} manual={manualDates} exceptions={exceptions} onToggleException={toggleException} />
          <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
            <span className="text-fg-faint" style={{ fontSize: '0.75rem' }}>Next occurrences</span>
            {upcoming.length === 0 && <span className="text-fg-faint">none upcoming</span>}
            {upcoming.map(({ date, rule }) => (
              <span key={`${rule.key}-${date}`} className="text-fg-muted">
                {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {rule.startTime && <span className="text-fg-faint"> · {timeRange(rule)}</span>}
                {rule.freq === 'manual' && <span style={{ color: MANUAL_COLOR }}> · one-off</span>}
              </span>
            ))}
          </div>
        </Section>

        <Section title="One-off dates">
          {manual.map((rule) => (
            <div key={rule.key} className="flex items-center gap-2 text-fg-muted">
              <span className="flex-1">
                {new Date(`${rule.startDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                {rule.startTime ? <span className="text-fg-faint"> · {timeRange(rule)}</span> : ''}
              </span>
              <button type="button" aria-label="remove date" title="remove date" onClick={() => setManual((cur) => cur.filter((r) => r.key !== rule.key))} className="rounded-tab p-1 text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"><X size={12} /></button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className={`${FIELD_CLASS} !w-auto`} />
            <input type="time" value={manualTime} onChange={(e) => setManualTime(e.target.value)} className={`${FIELD_CLASS} !w-auto`} />
            <input type="number" min={5} placeholder="min" value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} className={`${FIELD_CLASS} !w-16 text-center`} />
            <button type="button" disabled={!manualDate} onClick={addManual} className={`${CHIP_BASE} ${CHIP_OFF} py-1.5 disabled:opacity-40`}>Add</button>
          </div>
        </Section>
      </div>

      <footer className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-4 py-3">
        <button type="button" onClick={onCancel} className="rounded-tab border border-border-subtle px-3 py-1.5 text-fg-muted transition-colors duration-panel ease-panel hover:text-fg-prominent">Cancel</button>
        <button type="button" disabled={!canSave} onClick={save} className="rounded-tab bg-fg-prominent px-4 py-1.5 font-medium text-bg transition-opacity duration-panel ease-panel enabled:hover:opacity-85 disabled:opacity-40">Save</button>
      </footer>
    </div>
  );
}
