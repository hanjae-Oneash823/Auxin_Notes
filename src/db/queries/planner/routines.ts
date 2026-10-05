import type Database from '@tauri-apps/plugin-sql';
import { ulid } from 'ulid';
import { insertNode } from './nodes.ts';
import { ruleOccurrenceDates } from './occurrences.ts';
import type { Importance, NodeType, Routine, RoutineRule, RoutineRuleInput } from './types.ts';
import { localDateKey, nowIso, patchRow, placeholders } from './util.ts';

interface RoutineRow {
  id: string;
  title: string;
  node_type: NodeType;
  arc_id: string | null;
  project_id: string | null;
  importance_level: Importance;
  created_at: string;
  updated_at: string;
}

interface RuleRow {
  id: string;
  routine_id: string;
  sort_order: number;
  freq: RoutineRule['freq'];
  repeat_interval: number;
  days: string | null;
  start_date: string;
  end_mode: 'count' | 'date';
  end_count: number | null;
  end_date: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  exceptions: string | null;
}

const toRule = (row: RuleRow): RoutineRule => ({
  id: row.id, routineId: row.routine_id, sortOrder: row.sort_order, freq: row.freq, repeatInterval: row.repeat_interval,
  days: row.days ? (JSON.parse(row.days) as number[]) : [], startDate: row.start_date, endMode: row.end_mode,
  endCount: row.end_count, endDate: row.end_date, startTime: row.start_time, durationMinutes: row.duration_minutes,
  exceptions: row.exceptions ? (JSON.parse(row.exceptions) as string[]) : [],
});

const toRoutine = (row: RoutineRow, rules: RoutineRule[], groupIds: string[]): Routine => ({
  id: row.id, title: row.title, nodeType: row.node_type, arcId: row.arc_id, projectId: row.project_id,
  importanceLevel: row.importance_level, createdAt: row.created_at, updatedAt: row.updated_at, rules, groupIds,
});

/** Mycelium generates routine nodes this far ahead of today. */
const HORIZON_YEARS = 1;

function horizonDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + HORIZON_YEARS);
  return localDateKey(date);
}

const jsonOrNull = (values: readonly (string | number)[]): string | null => (values.length > 0 ? JSON.stringify(values) : null);

// ── Reading ───────────────────────────────────────────────────────────────────

/** All routines with rules and groups attached — three queries total, not one per routine. */
export async function listRoutines(db: Database): Promise<Routine[]> {
  const [routineRows, ruleRows, groupRows] = await Promise.all([
    db.select<RoutineRow[]>('SELECT * FROM routines ORDER BY created_at DESC'),
    db.select<RuleRow[]>('SELECT * FROM routine_rules ORDER BY sort_order ASC, rowid ASC'),
    db.select<{ routine_id: string; group_id: string }[]>('SELECT routine_id, group_id FROM routine_groups'),
  ]);
  return routineRows.map((row) => toRoutine(
    row,
    ruleRows.filter((rule) => rule.routine_id === row.id).map(toRule),
    groupRows.filter((group) => group.routine_id === row.id).map((group) => group.group_id),
  ));
}

export async function getRoutine(db: Database, id: string): Promise<Routine | null> {
  return (await listRoutines(db)).find((routine) => routine.id === id) ?? null;
}

/** routine id → number of completed generated nodes. */
export async function routineCompletedCounts(db: Database): Promise<Record<string, number>> {
  const rows = await db.select<{ routine_id: string; count: number }[]>(
    'SELECT routine_id, COUNT(*) AS count FROM nodes WHERE is_routine = 1 AND is_completed = 1 AND routine_id IS NOT NULL GROUP BY routine_id',
  );
  return Object.fromEntries(rows.map((row) => [row.routine_id, row.count]));
}

// ── Writing ───────────────────────────────────────────────────────────────────

export interface RoutineFields {
  title: string;
  nodeType: NodeType;
  arcId: string | null;
  projectId: string | null;
  importanceLevel: Importance;
  groupIds: readonly string[];
  rules: readonly RoutineRuleInput[];
}

async function insertRule(db: Database, routineId: string, rule: RoutineRuleInput, sortOrder: number): Promise<void> {
  await db.execute(
    `INSERT INTO routine_rules
       (id, routine_id, sort_order, freq, repeat_interval, days, start_date, end_mode, end_count, end_date,
        start_time, duration_minutes, exceptions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ulid(), routineId, sortOrder, rule.freq, rule.repeatInterval, jsonOrNull(rule.days), rule.startDate, rule.endMode,
      rule.endCount, rule.endDate, rule.startTime, rule.durationMinutes, jsonOrNull(rule.exceptions),
    ],
  );
}

/** Inserts the new rules first and prunes the old ones after, so a failure never leaves a routine with none. */
async function replaceRules(db: Database, routineId: string, rules: readonly RoutineRuleInput[]): Promise<void> {
  const previous = await db.select<{ id: string }[]>('SELECT id FROM routine_rules WHERE routine_id = ?', [routineId]);
  for (const [index, rule] of rules.entries()) await insertRule(db, routineId, rule, index);
  if (previous.length > 0) {
    await db.execute(`DELETE FROM routine_rules WHERE id IN (${placeholders(previous.length)})`, previous.map((row) => row.id));
  }
}

async function setRoutineGroups(db: Database, routineId: string, groupIds: readonly string[]): Promise<void> {
  const wanted = [...new Set(groupIds)];
  for (const groupId of wanted) {
    await db.execute('INSERT OR IGNORE INTO routine_groups (routine_id, group_id) VALUES (?, ?)', [routineId, groupId]);
  }
  if (wanted.length === 0) {
    await db.execute('DELETE FROM routine_groups WHERE routine_id = ?', [routineId]);
    return;
  }
  await db.execute(
    `DELETE FROM routine_groups WHERE routine_id = ? AND group_id NOT IN (${placeholders(wanted.length)})`,
    [routineId, ...wanted],
  );
}

export async function createRoutine(db: Database, input: RoutineFields): Promise<Routine> {
  const id = ulid();
  const now = nowIso();
  await db.execute(
    'INSERT INTO routines (id, title, node_type, arc_id, project_id, importance_level, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, input.title, input.nodeType, input.arcId, input.projectId, input.importanceLevel, now, now],
  );
  await replaceRules(db, id, input.rules);
  await setRoutineGroups(db, id, input.groupIds);
  await generateRoutineNodes(db, id, localDateKey(), horizonDate());
  const routine = await getRoutine(db, id);
  if (!routine) throw new Error(`Routine ${id} vanished right after insert`);
  return routine;
}

/** Saves edits, then rebuilds the routine's future nodes so they pick up the new rules, groups and fields. */
export async function updateRoutine(db: Database, id: string, input: RoutineFields): Promise<void> {
  await patchRow(db, 'routines', id, {
    title: input.title, node_type: input.nodeType, arc_id: input.arcId, project_id: input.projectId,
    importance_level: input.importanceLevel, updated_at: nowIso(),
  });
  await replaceRules(db, id, input.rules);
  await setRoutineGroups(db, id, input.groupIds);
  await regenerateRoutineNodes(db, id);
}

/** Incomplete generated nodes go with the routine; completed ones stay as history (routine_id becomes NULL). */
export async function deleteRoutine(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM nodes WHERE routine_id = ? AND is_completed = 0', [id]);
  await db.execute('DELETE FROM routines WHERE id = ?', [id]);
}

// ── Node generation ───────────────────────────────────────────────────────────

const plannedStartFor = (date: string, rule: Pick<RoutineRule, 'startTime'>): string =>
  rule.startTime ? `${date}T${rule.startTime}:00` : date;

/**
 * Creates the routine's missing nodes in [fromDate, toDate]. A date that already
 * has a node (even a completed one) is skipped. Manual rules ignore the window.
 * Returns how many nodes were created.
 */
export async function generateRoutineNodes(db: Database, routineId: string, fromDate: string, toDate: string): Promise<number> {
  const routine = await getRoutine(db, routineId);
  if (!routine || routine.rules.length === 0) return 0;

  const existing = await db.select<{ planned_start_at: string | null }[]>('SELECT planned_start_at FROM nodes WHERE routine_id = ?', [routineId]);
  const taken = new Set(existing.flatMap((row) => (row.planned_start_at ? [row.planned_start_at.slice(0, 10)] : [])));
  let created = 0;

  for (const rule of routine.rules) {
    const dates = ruleOccurrenceDates(rule).filter((date) => rule.freq === 'manual' || (date >= fromDate && date <= toDate));
    for (const date of dates) {
      if (taken.has(date)) continue;
      await insertNode(db, {
        title: routine.title, nodeType: routine.nodeType, projectId: routine.projectId, arcId: routine.arcId,
        plannedStartAt: plannedStartFor(date, rule), estimatedDurationMinutes: rule.durationMinutes,
        importanceLevel: routine.importanceLevel, isRoutine: true, routineId, groupIds: routine.groupIds,
      });
      taken.add(date);
      created += 1;
    }
  }
  return created;
}

/** Drops incomplete nodes from today on, then regenerates today → one year out. */
export async function regenerateRoutineNodes(db: Database, routineId: string): Promise<void> {
  const today = localDateKey();
  await db.execute('DELETE FROM nodes WHERE routine_id = ? AND is_completed = 0 AND planned_start_at >= ?', [routineId, today]);
  await generateRoutineNodes(db, routineId, today, horizonDate());
}

/** Startup top-up: generates any missing nodes for every routine without deleting anything. */
export async function fillMissingRoutineNodes(db: Database): Promise<number> {
  const today = localDateKey();
  const until = horizonDate();
  let created = 0;
  for (const routine of await listRoutines(db)) {
    created += await generateRoutineNodes(db, routine.id, today, until);
  }
  return created;
}

/** Deletes the incomplete node for one routine date (immediate skip from the edit form). */
export async function deleteRoutineNodeByDate(db: Database, routineId: string, date: string): Promise<void> {
  await db.execute(
    'DELETE FROM nodes WHERE routine_id = ? AND substr(planned_start_at, 1, 10) = ? AND is_completed = 0',
    [routineId, date],
  );
}

/** Un-skips a date: removes it from its rule's exceptions and creates the node unless one already exists. */
export async function cancelException(db: Database, routineId: string, date: string): Promise<void> {
  const routine = await getRoutine(db, routineId);
  const rule = routine?.rules.find((candidate) => candidate.exceptions.includes(date));
  if (!routine || !rule) return;

  await db.execute('UPDATE routine_rules SET exceptions = ? WHERE id = ?', [
    jsonOrNull(rule.exceptions.filter((skipped) => skipped !== date)), rule.id,
  ]);
  const existing = await db.select<{ id: string }[]>(
    'SELECT id FROM nodes WHERE routine_id = ? AND substr(planned_start_at, 1, 10) = ? LIMIT 1',
    [routineId, date],
  );
  if (existing.length > 0) return;

  await insertNode(db, {
    title: routine.title, nodeType: routine.nodeType, projectId: routine.projectId, arcId: routine.arcId,
    plannedStartAt: plannedStartFor(date, rule), estimatedDurationMinutes: rule.durationMinutes,
    importanceLevel: routine.importanceLevel, isRoutine: true, routineId, groupIds: routine.groupIds,
  });
}
