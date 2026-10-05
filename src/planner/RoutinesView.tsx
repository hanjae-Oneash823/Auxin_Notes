import { useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import type { PlannerNode, Routine } from '../db/queries/planner/types';
import { RoutineCard } from './RoutineCard';
import { RoutineForm } from './RoutineForm';
import { offsetDateKey, plannedDateOf, todayKey } from './nodeDerived';
import { usePlannerStore } from './plannerStore';
import { HEATMAP_DAYS } from './routineDerived';

const NO_ARC = '__none__';
const NO_ARC_COLOR = 'rgba(255,255,255,0.28)';
const NEVER = '9999-99-99';

interface Section { key: string; label: string; color: string; items: readonly Routine[] }

interface RoutineStats {
  nextDate: string | null;
  pendingCount: number;
  /** date → completed? within the heatmap window. */
  dayMap: Map<string, boolean>;
}

/** Per routine: its pending occurrences, next date and heatmap days, from the generated nodes. */
function statsByRoutine(nodes: readonly PlannerNode[]): Map<string, RoutineStats> {
  const today = todayKey();
  const windowStart = offsetDateKey(-(HEATMAP_DAYS - 1));
  const stats = new Map<string, RoutineStats>();
  for (const node of nodes) {
    const date = plannedDateOf(node);
    if (!node.isRoutine || !node.routineId || !date) continue;
    const entry = stats.get(node.routineId) ?? { nextDate: null, pendingCount: 0, dayMap: new Map<string, boolean>() };
    if (!node.isCompleted) {
      entry.pendingCount += 1;
      if (date >= today && (entry.nextDate === null || date < entry.nextDate)) entry.nextDate = date;
    }
    if (date >= windowStart && date <= today) entry.dayMap.set(date, (entry.dayMap.get(date) ?? false) || node.isCompleted);
    stats.set(node.routineId, entry);
  }
  return stats;
}

/** Mycelium's Routines view: routines grouped into collapsible arc sections, each sorted by next occurrence. */
export function RoutinesView() {
  const { routines, arcs, projects, nodes, routineDoneCounts, saveRoutine, removeRoutine } = usePlannerStore();
  const [editing, setEditing] = useState<Routine | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const stats = useMemo(() => statsByRoutine(nodes), [nodes]);
  const nextOf = (routine: Routine) => stats.get(routine.id)?.nextDate ?? NEVER;
  const byNext = (a: Routine, b: Routine) => nextOf(a).localeCompare(nextOf(b));

  // Routines under a finished or archived arc / project are hidden, like Mycelium.
  const isLive = (routine: Routine) =>
    (arcs.find((arc) => arc.id === routine.arcId)?.status ?? 'active') === 'active'
    && (projects.find((project) => project.id === routine.projectId)?.status ?? 'active') === 'active';
  const visible = routines.filter(isLive);

  const sections: Section[] = [
    ...arcs.filter((arc) => arc.status === 'active').map((arc) => ({ key: arc.id, label: arc.name, color: arc.colorHex, items: visible.filter((r) => r.arcId === arc.id) })),
    { key: NO_ARC, label: 'no arc', color: NO_ARC_COLOR, items: visible.filter((r) => !r.arcId) },
  ]
    .filter((section) => section.items.length > 0)
    .map((section) => ({ ...section, items: [...section.items].sort(byNext) }));

  function openForm(routine: Routine | null) {
    setEditing(routine);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditing(null);
  }

  function toggle(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => openForm(null)}
          className="flex items-center gap-1.5 rounded-tab border border-border-subtle px-3 py-1.5 text-fg-muted transition-colors duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent"
        >
          <Plus size={14} />
          New routine
        </button>
      </div>

      {sections.length === 0 && <p className="text-fg-faint">$ no routines yet — create one with “New routine”</p>}

      {sections.map(({ key, label, color, items }) => {
        const isCollapsed = collapsed.has(key);
        return (
          <section key={key} className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => toggle(key)}
              className="flex w-full items-center gap-2 border-b py-1"
              style={{ borderColor: isCollapsed ? 'var(--border-subtle, rgba(255,255,255,0.06))' : `${color}33` }}
            >
              <span className="h-2 w-2 shrink-0" style={{ background: color }} />
              <span className="uppercase tracking-widest" style={{ color }}>{label}</span>
              <span className="text-fg-faint" style={{ fontSize: '0.78rem' }}>[{items.length}]</span>
              <span className="ml-auto text-fg-faint" style={{ fontSize: '0.78rem' }}>{isCollapsed ? '[+]' : '[-]'}</span>
            </button>
            {!isCollapsed && (
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                {items.map((routine) => {
                  const routineStats = stats.get(routine.id);
                  return (
                    <RoutineCard
                      key={routine.id}
                      routine={routine}
                      arc={arcs.find((arc) => arc.id === routine.arcId)}
                      project={projects.find((project) => project.id === routine.projectId)}
                      nextDate={routineStats?.nextDate ?? null}
                      dayMap={routineStats?.dayMap ?? new Map()}
                      doneCount={routineDoneCounts[routine.id] ?? 0}
                      pendingCount={routineStats?.pendingCount ?? 0}
                      onEdit={() => openForm(routine)}
                      onDelete={() => void removeRoutine(routine.id)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {isFormOpen && (
        <RoutineForm
          initial={editing}
          onSave={(id, fields) => { closeForm(); void saveRoutine(id, fields); }}
          onCancel={closeForm}
        />
      )}
    </div>
  );
}
