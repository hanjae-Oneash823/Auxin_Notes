// Runnable check for the planner data layer. It runs the real migration and the
// real query modules against an in-memory SQLite (node:sqlite):
//   node --experimental-strip-types --no-warnings src/db/queries/planner/planner.check.ts
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type Database from '@tauri-apps/plugin-sql';
import { createArc, createProject, deleteArc, listProjects } from './structure.ts';
import { createGroup, deleteGroup, listGroups, setNodeGroups } from './groups.ts';
import { addEdge, addSubTask, createNode, deleteNode, getNode, listEdges, listNodes, listSubTasks, setNodeCompleted, setSubTaskCompleted, updateNode } from './nodes.ts';
import { generateOccurrenceDates, ruleOccurrenceDates } from './occurrences.ts';
import {
  cancelException, createRoutine, deleteRoutine, fillMissingRoutineNodes, generateRoutineNodes, getRoutine, regenerateRoutineNodes,
  routineCompletedCounts, updateRoutine, type RoutineFields,
} from './routines.ts';
import {
  addNodesToSession, arcBreakdown, createLocation, createSession, deleteSession, endSession, finishNode, generateSessionTitle,
  getActiveSession, listPauses, listSessionNodes, markNodeIncomplete, pauseSession, resumeSession, startNode, startSession,
} from './sessions.ts';
import type { RoutineRuleInput } from './types.ts';
import { localDateKey } from './util.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`planner check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

async function throws(run: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await run();
  } catch {
    return;
  }
  throw new Error(`planner check failed: ${message} (expected an error)`);
}

function openDb(): Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../../migrations/planner/0001_init.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../../migrations/planner/0002_pools.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../../migrations/planner/0003_freezer.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../../migrations/planner/0004_grill.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO planner_groups (id, name, color_hex, sort_order, is_ungrouped, created_at) VALUES ('g-ungrouped', 'ungrouped', '#888', 0, 1, '2026-01-01T00:00:00.000Z')");
  return {
    select: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).all(...(params as never[])).map((row) => ({ ...row })),
    execute: async (sql: string, params: unknown[] = []) => {
      const result = sqlite.prepare(sql).run(...(params as never[]));
      return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
    },
  } as unknown as Database;
}

const rule = (partial: Partial<RoutineRuleInput>): RoutineRuleInput => ({
  freq: 'weekly', repeatInterval: 1, days: [], startDate: '2026-03-02', endMode: 'count', endCount: 52, endDate: null,
  startTime: null, durationMinutes: null, exceptions: [], ...partial,
});

const shiftDays = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};

// ── occurrences (pure) ────────────────────────────────────────────────────────

// 2026-03-02 is a Monday. Mon/Wed/Fri for two weeks, then only the first 4 by count.
equal(
  ruleOccurrenceDates(rule({ days: [1, 3, 5], endMode: 'date', endDate: '2026-03-13' })),
  ['2026-03-02', '2026-03-04', '2026-03-06', '2026-03-09', '2026-03-11', '2026-03-13'],
  'weekly Mon/Wed/Fri until a date',
);
equal(ruleOccurrenceDates(rule({ days: [1, 3, 5], endCount: 4 })), ['2026-03-02', '2026-03-04', '2026-03-06', '2026-03-09'], 'count limits occurrences');
// Exceptions are removed AFTER the count is applied, so skipping one date shortens the list.
equal(ruleOccurrenceDates(rule({ days: [1, 3, 5], endCount: 4, exceptions: ['2026-03-04'] })), ['2026-03-02', '2026-03-06', '2026-03-09'], 'exceptions apply after count');
equal(ruleOccurrenceDates(rule({ freq: 'manual', startDate: '2026-05-05' })), ['2026-05-05'], 'manual rule is one date');
equal(ruleOccurrenceDates(rule({ freq: 'daily', repeatInterval: 3, endCount: 3, startDate: '2026-03-01' })), ['2026-03-01', '2026-03-04', '2026-03-07'], 'every 3 days');
equal(ruleOccurrenceDates(rule({ freq: 'weekly', repeatInterval: 2, endCount: 2, startDate: '2026-03-02' })), ['2026-03-02', '2026-03-16'], 'every 2 weeks, no weekdays');
// Mycelium quirk kept on purpose: a day-31 monthly rule overflows via Date.setMonth.
equal(ruleOccurrenceDates(rule({ freq: 'monthly', startDate: '2026-01-31', endCount: 3 })), ['2026-01-31', '2026-03-03', '2026-04-03'], 'monthly day-31 overflow quirk');
// With no end date a rule looks one year ahead, inclusive of the anniversary day.
equal(generateOccurrenceDates({ freq: 'daily', interval: 1 }, '2026-01-01').length, 366, 'no end date looks one year ahead');

// ── structure ─────────────────────────────────────────────────────────────────

{
  const db = openDb();
  const arc = await createArc(db, { name: 'Thesis' });
  const project = await createProject(db, { name: 'Lit review', arcId: arc.id });
  const node = await createNode(db, { title: 'Read paper', arcId: arc.id, projectId: project.id });
  await deleteArc(db, arc.id);
  equal((await listProjects(db))[0].arcId, null, 'deleting an arc detaches its projects');
  equal((await getNode(db, node.id))?.arcId, null, 'deleting an arc detaches its nodes');
}

// ── groups: the ungrouped invariant ───────────────────────────────────────────

{
  const db = openDb();
  const work = await createGroup(db, { name: 'Deep work' });
  const admin = await createGroup(db, { name: 'Admin' });
  equal([work.sortOrder, admin.sortOrder], [1, 2], 'new groups sort after existing ones');

  const bare = await createNode(db, { title: 'No group' });
  equal(bare.groupIds, ['g-ungrouped'], 'a node with no groups sits in ungrouped');

  await setNodeGroups(db, bare.id, [work.id, admin.id]);
  equal((await getNode(db, bare.id))?.groupIds.sort(), [admin.id, work.id].sort(), 'real groups replace ungrouped');

  await setNodeGroups(db, bare.id, []);
  equal((await getNode(db, bare.id))?.groupIds, ['g-ungrouped'], 'clearing groups returns to ungrouped');

  await setNodeGroups(db, bare.id, [work.id]);
  await deleteGroup(db, work.id);
  equal((await getNode(db, bare.id))?.groupIds, ['g-ungrouped'], 'deleting a node\'s only group restores ungrouped');
  await throws(() => deleteGroup(db, 'g-ungrouped'), 'the ungrouped group cannot be deleted');
  equal((await listGroups(db)).map((g) => g.name), ['ungrouped', 'Admin'], 'group list after deletes');
}

// ── nodes ─────────────────────────────────────────────────────────────────────

{
  const db = openDb();
  const node = await createNode(db, { title: 'Write intro', plannedStartAt: '2026-03-02T09:00:00', importanceLevel: 1, subTaskTitles: ['outline', 'draft'] });
  equal([node.subTotal, node.subDone, node.importanceLevel], [2, 0, 1], 'subtasks and importance on create');

  const [first] = await listSubTasks(db, node.id);
  await setSubTaskCompleted(db, first.id, true);
  equal((await getNode(db, node.id))?.subDone, 1, 'completing a subtask updates the count');

  await updateNode(db, node.id, { title: 'Write the intro', isPinned: true, dueAt: '2026-03-10' });
  const edited = await getNode(db, node.id);
  equal([edited?.title, edited?.isPinned, edited?.dueAt], ['Write the intro', true, '2026-03-10'], 'patch applies only given fields');
  equal(edited?.plannedStartAt, '2026-03-02T09:00:00', 'untouched fields survive a patch');
  await updateNode(db, node.id, { dueAt: null });
  equal((await getNode(db, node.id))?.dueAt, null, 'null clears a field');

  await createNode(db, { title: 'Other day', plannedStartAt: '2026-03-05' });
  await createNode(db, { title: 'Unscheduled' });
  equal((await listNodes(db, { plannedFrom: '2026-03-02', plannedTo: '2026-03-02' })).map((n) => n.title), ['Write the intro'], 'date filter matches datetime and date-only values');
  equal((await listNodes(db)).map((n) => n.title), ['Write the intro', 'Other day', 'Unscheduled'], 'unscheduled nodes sort last');

  await setNodeCompleted(db, node.id, true);
  await setNodeCompleted(db, node.id, true);
  const logs = async () => (await db.select<{ n: number }[]>('SELECT COUNT(*) AS n FROM productivity_logs'))[0].n;
  equal([(await getNode(db, node.id))?.isCompleted, await logs()], [true, 1], 'completing twice logs once');
  await setNodeCompleted(db, node.id, false);
  equal([(await getNode(db, node.id))?.actualCompletedAt, await logs()], [null, 0], 'un-completing clears the timestamp and the log');

  const other = await createNode(db, { title: 'Blocked' });
  await addEdge(db, { projectId: 'p', sourceId: node.id, targetId: other.id });
  equal((await listEdges(db, 'p')).length, 1, 'dependency edge stored');
  await addSubTask(db, node.id, 'extra');
  await deleteNode(db, node.id);
  equal([(await listEdges(db)).length, (await listSubTasks(db, node.id)).length], [0, 0], 'deleting a node cascades edges and subtasks');
  equal((await db.select('SELECT * FROM node_groups WHERE node_id = ?', [node.id])).length, 0, 'deleting a node cascades group links');
}

// ── pools ─────────────────────────────────────────────────────────────────────

{
  const db = openDb();
  const task = await createNode(db, { title: 'Task' });
  equal(task.pool, 'hot', 'new nodes default to the hot pool');
  equal((await createNode(db, { title: 'Chosen id', id: 'chosen-id' })).id, 'chosen-id', 'a caller-chosen id is used for the new row');
  const parked = await createNode(db, { title: 'Parked', pool: 'inbox' });
  equal(parked.pool, 'inbox', 'a pool can be chosen on create');
  await updateNode(db, task.id, { pool: 'cold' });
  equal((await getNode(db, task.id))?.pool, 'cold', 'a pool can be changed');
  await updateNode(db, task.id, { pool: 'freezer' });
  equal((await getNode(db, task.id))?.pool, 'freezer', 'the freezer pool is accepted');
  await updateNode(db, task.id, { pool: 'grill' });
  equal((await getNode(db, task.id))?.pool, 'grill', 'the grill pool is accepted');
  await throws(() => updateNode(db, task.id, { pool: 'lukewarm' as never }), 'the CHECK rejects an unknown pool');
}

// ── routines & node generation ────────────────────────────────────────────────

{
  const db = openDb();
  const group = await createGroup(db, { name: 'Health' });
  const fields: RoutineFields = {
    title: 'Run', nodeType: 'task', arcId: null, projectId: null, importanceLevel: 0, groupIds: [group.id],
    rules: [rule({ freq: 'daily', startDate: localDateKey(), endCount: 5, startTime: '07:30', durationMinutes: 45 })],
  };
  const routine = await createRoutine(db, fields);
  const generated = await listNodes(db, { routineId: routine.id });
  equal(generated.length, 5, 'creating a routine generates its nodes');
  equal(generated[0].plannedStartAt, `${localDateKey()}T07:30:00`, 'timed rules produce local datetimes');
  equal([generated[0].estimatedDurationMinutes, generated[0].isRoutine, generated[0].groupIds], [45, true, [group.id]], 'generated nodes copy duration and groups');

  equal(await generateRoutineNodes(db, routine.id, localDateKey(), shiftDays(400)), 0, 'generation is idempotent');
  equal(await fillMissingRoutineNodes(db), 0, 'startup top-up creates nothing when complete');

  await setNodeCompleted(db, generated[0].id, true);
  equal((await routineCompletedCounts(db))[routine.id], 1, 'completed counts per routine');
  await updateRoutine(db, routine.id, { ...fields, rules: [rule({ freq: 'daily', startDate: localDateKey(), endCount: 3, startTime: '07:30' })] });
  const rebuilt = await listNodes(db, { routineId: routine.id });
  equal(rebuilt.length, 3, 'editing rules rebuilds future nodes (completed one kept, 2 regenerated)');
  equal(rebuilt.filter((n) => n.isCompleted).length, 1, 'regeneration keeps completed history');
  equal((await getRoutine(db, routine.id))?.rules.length, 1, 'rules are replaced, not duplicated');

  // Manual rules spawn regardless of the date window.
  const manual = await createRoutine(db, { ...fields, title: 'Office hours', groupIds: [], rules: [rule({ freq: 'manual', startDate: '2026-01-15', startTime: '15:00' })] });
  equal((await listNodes(db, { routineId: manual.id })).map((n) => n.plannedStartAt), ['2026-01-15T15:00:00'], 'a past manual date still spawns its node');

  // cancelException: skipped date comes back.
  const skipDate = shiftDays(2);
  const skipping = await createRoutine(db, { ...fields, title: 'Skippy', groupIds: [], rules: [rule({ freq: 'daily', startDate: localDateKey(), endCount: 4, exceptions: [skipDate] })] });
  equal((await listNodes(db, { routineId: skipping.id })).length, 3, 'an exception date gets no node');
  await cancelException(db, skipping.id, skipDate);
  equal((await listNodes(db, { routineId: skipping.id })).length, 4, 'cancelling an exception restores the node');
  equal((await getRoutine(db, skipping.id))?.rules[0].exceptions, [], 'and clears it from the rule');

  await regenerateRoutineNodes(db, skipping.id);
  equal((await listNodes(db, { routineId: skipping.id })).length, 4, 'regenerating is stable');

  await deleteRoutine(db, routine.id);
  const left = await listNodes(db, { routineId: routine.id });
  equal(left.length, 0, 'deleting a routine removes its incomplete nodes');
  const survivor = (await listNodes(db)).find((n) => n.isCompleted);
  equal([survivor?.isRoutine, survivor?.routineId], [true, null], 'completed nodes survive with routine_id cleared');
}

// ── sessions ──────────────────────────────────────────────────────────────────

{
  const db = openDb();
  const arc = await createArc(db, { name: 'Thesis', colorHex: '#8b82be' });
  const location = await createLocation(db, 'Home Desk');
  const date = localDateKey();
  equal(await generateSessionTitle(db, location.id, date), `${date.replace(/-/g, '')}-home-desk`, 'title is date + location slug');

  const session = await createSession(db, location.id, date);
  equal(session.status, 'planned', 'new sessions are planned');
  equal((await createSession(db, location.id, date)).title.endsWith('-01'), true, 'a repeat title gets a -01 suffix');

  const done = await createNode(db, { title: 'Already done' });
  await setNodeCompleted(db, done.id, true);
  const task = await createNode(db, { title: 'Draft', arcId: arc.id });
  await addNodesToSession(db, session.id, [done.id, task.id]);
  await startSession(db, session.id);
  equal((await listSessionNodes(db, session.id)).map((n) => n.title), ['Draft'], 'starting drops nodes completed elsewhere');
  equal((await getActiveSession(db))?.id, session.id, 'the started session is the active one');

  await startNode(db, session.id, task.id);
  const pauseId = await pauseSession(db, session.id);
  equal((await getActiveSession(db))?.status, 'paused', 'pausing keeps it as the active session');
  await resumeSession(db, session.id, pauseId);
  equal((await listPauses(db, session.id))[0].resumedAt !== null, true, 'resume closes the pause');

  await finishNode(db, session.id, task.id);
  const [finished] = await listSessionNodes(db, session.id);
  equal([finished.status, (finished.totalMinutes ?? -1) >= 0, finished.arcName], ['done', true, 'Thesis'], 'finishing records minutes and keeps the arc');
  equal((await getNode(db, task.id))?.isCompleted, true, 'finishing completes the planner node');
  equal((await db.select<{ n: number }[]>('SELECT COUNT(*) AS n FROM productivity_logs WHERE node_id = ?', [task.id]))[0].n, 1, 'and logs the completion');

  const lecture = await createNode(db, { title: 'Lecture', nodeType: 'event' });
  const third = await createNode(db, { title: 'Essay' });
  await throws(() => addNodesToSession(db, session.id, [third.id, lecture.id]), 'an event cannot be added to a session');
  equal((await listSessionNodes(db, session.id)).map((n) => n.title), ['Draft'], 'and the rejected batch added nothing, not even its tasks');

  const second = await createNode(db, { title: 'Reading' });
  await addNodesToSession(db, session.id, [second.id]);
  await startNode(db, session.id, second.id);
  await markNodeIncomplete(db, session.id, second.id);
  await endSession(db, session.id, 'completed');
  equal((await getActiveSession(db)), null, 'ending clears the active session');
  equal((await listSessionNodes(db, session.id)).map((n) => n.status), ['done', 'incomplete'], 'finished nodes list after queue order');
  await arcBreakdown(db, date, date);

  await deleteSession(db, session.id);
  equal((await db.select('SELECT * FROM session_nodes WHERE session_id = ?', [session.id])).length, 0, 'deleting a session cascades its nodes');
}

console.log('planner data layer: all checks passed');
