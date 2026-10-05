import { useEffect, useMemo, useState } from 'react';
import { ruleOccurrenceDates } from '../db/queries/planner/occurrences';
import type { Importance, NodeType, Routine, RoutineRuleInput } from '../db/queries/planner/types';
import type { RoutineFields } from '../db/queries/planner/routines';
import { RoutineCalendar } from './RoutineCalendar';
import { RuleEditor } from './RuleEditor';
import { offsetDateKey, todayKey } from './nodeDerived';
import { usePlannerStore } from './plannerStore';
import { CHIP_BASE, CHIP_OFF, CHIP_ON, FIELD_CLASS } from './plannerStyles';
import { manualRuleInput, newRuleInput, timeRange } from './routineDerived';

const UPCOMING_LIMIT = 6;
const HORIZON_DAYS = 60;
const MANUAL_COLOR = '#64c8ff';
const NODE_TYPES: readonly { type: NodeType; label: string; desc: string }[] = [
  { type: 'task', label: 'Task', desc: 'flexible · recurring work' },
  { type: 'event', label: 'Event', desc: 'scheduled at a specific time' },
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

function Heading({ children }: { children: string }) {
  return <h3 className="uppercase tracking-wider text-fg-faint" style={{ fontSize: '0.68rem' }}>{children}</h3>;
}

/** Routine editor modeled on Mycelium's RoutineForm: calendar preview with
 *  skippable dates and an occurrence list on the left; identity, recurrence
 *  rules and manual dates on the right. */
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-label={initial ? 'Edit routine' : 'New routine'}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-[820px] max-w-[94vw] flex-col gap-4 overflow-y-auto rounded-tab border border-border bg-bg p-5"
        style={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem' }}
      >
        <h2 className="font-semibold text-fg-prominent" style={{ fontSize: '0.95rem' }}>{initial ? 'Edit routine' : 'New routine'}</h2>

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-[260px] flex-1 flex-col gap-5">
            <section className="flex flex-col gap-2">
              <Heading>calendar</Heading>
              <RoutineCalendar month={month} onMonthChange={setMonth} fixed={fixedDates} manual={manualDates} exceptions={exceptions} onToggleException={toggleException} />
            </section>
            <section className="flex flex-col gap-1">
              <Heading>occurrences</Heading>
              {upcoming.length === 0 && <span className="text-fg-faint">none upcoming</span>}
              {upcoming.map(({ date, rule }) => (
                <span key={`${rule.key}-${date}`} className="text-fg-muted" style={{ fontSize: '0.8rem' }}>
                  {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {rule.startTime && <span className="text-fg-faint"> · {timeRange(rule)}</span>}
                  {rule.freq === 'manual' && <span style={{ color: MANUAL_COLOR }}> · manual</span>}
                </span>
              ))}
            </section>
          </div>

          <div className="flex min-w-[320px] flex-[1.4] flex-col gap-5">
            <section className="flex flex-col gap-2.5">
              <Heading>identity</Heading>
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="routine name" className={FIELD_CLASS} />
              <div className="flex gap-1.5">
                {NODE_TYPES.map(({ type, label, desc }) => (
                  <button key={type} type="button" onClick={() => setNodeType(type)} title={desc} className={`${CHIP_BASE} flex-1 py-1.5 ${nodeType === type ? CHIP_ON : CHIP_OFF}`}>{label}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <select value={arcId} onChange={(e) => pickArc(e.target.value)} className={FIELD_CLASS}>
                  <option value="">No arc</option>
                  {arcs.map((arc) => <option key={arc.id} value={arc.id}>{arc.name}</option>)}
                </select>
                <select value={projectId} onChange={(e) => pickProject(e.target.value)} className={FIELD_CLASS}>
                  <option value="">No project</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setIsImportant((v) => !v)} className={`${CHIP_BASE} ${isImportant ? 'border-accent-warning text-accent-warning' : CHIP_OFF}`}>{isImportant ? '★ important' : '☆ important'}</button>
                {groups.map((group) => {
                  const isOn = groupIds.includes(group.id);
                  return (
                    <button key={group.id} type="button" onClick={() => setGroupIds((cur) => (isOn ? cur.filter((id) => id !== group.id) : [...cur, group.id]))} className={`${CHIP_BASE} ${isOn ? CHIP_ON : CHIP_OFF}`} style={{ fontSize: '0.78rem' }}>
                      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: group.colorHex }} />
                      {group.name}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <Heading>recurrence rules</Heading>
              {rules.map((rule) => (
                <RuleEditor
                  key={rule.key}
                  rule={rule}
                  onChange={(next) => setRules((cur) => cur.map((r) => (r.key === rule.key ? { ...next, key: rule.key } : r)))}
                  onRemove={() => setRules((cur) => cur.filter((r) => r.key !== rule.key))}
                />
              ))}
              <button type="button" onClick={() => setRules((cur) => [...cur, editable(newRuleInput())])} className="self-start text-fg-muted hover:text-fg-prominent">+ add rule</button>
            </section>

            <section className="flex flex-col gap-2">
              <Heading>manual dates</Heading>
              {manual.map((rule) => (
                <div key={rule.key} className="flex items-center gap-2 text-fg-muted" style={{ fontSize: '0.8rem' }}>
                  <span className="flex-1">{rule.startDate}{rule.startTime ? ` · ${timeRange(rule)}` : ''}</span>
                  <button type="button" aria-label="remove date" onClick={() => setManual((cur) => cur.filter((r) => r.key !== rule.key))} className="text-fg-faint hover:text-fg-prominent">×</button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className={`${FIELD_CLASS} !w-auto`} />
                <input type="time" value={manualTime} onChange={(e) => setManualTime(e.target.value)} className={`${FIELD_CLASS} !w-auto`} />
                <input type="number" min={5} placeholder="min" value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} className={`${FIELD_CLASS} !w-20`} />
                <button type="button" disabled={!manualDate} onClick={addManual} className={`${CHIP_BASE} ${CHIP_OFF} py-1.5 disabled:opacity-40`}>add</button>
              </div>
            </section>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-tab border border-border-subtle px-3 py-1.5 text-fg-muted transition-colors duration-panel ease-panel hover:text-fg-prominent">Cancel</button>
          <button type="button" disabled={!canSave} onClick={save} className="rounded-tab border border-border-strong px-3 py-1.5 text-fg-prominent transition-colors duration-panel ease-panel enabled:hover:bg-border-subtle disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>
  );
}
