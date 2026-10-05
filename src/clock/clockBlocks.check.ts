// Runnable check for the clock strip's blocks: `node --experimental-strip-types src/clock/clockBlocks.check.ts`
import { clockBlocks } from './clockBlocks.ts';
import type { Arc, PlannerNode, SessionNode, WorkSession } from '../db/queries/planner/types.ts';
import type { SleepEntry } from '../db/queries/health/types.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`clockBlocks check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

const MINUTE = 60_000;
const local = (text: string) => new Date(text).getTime();
const DAY_START = local('2026-03-02T00:00:00');
const DAY_END = local('2026-03-02T23:59:59');

const node = (partial: Partial<PlannerNode>): PlannerNode => ({
  id: 'n', projectId: null, arcId: null, title: 'Node', nodeType: 'task', pool: 'hot', plannedStartAt: '2026-03-02T10:00:00', dueAt: null,
  actualCompletedAt: null, estimatedDurationMinutes: 60, importanceLevel: 0, isCompleted: false, isLocked: false, isPinned: false,
  isFrogPinned: false, isRoutine: false, routineId: null, createdAt: '', updatedAt: '', groupIds: [], subTotal: 0, subDone: 0,
  ...partial,
});

const session = (partial: Partial<WorkSession>): WorkSession => ({
  id: 's', title: '20260302-library', locationId: null, locationName: 'Library', plannedDate: '2026-03-02',
  actualStart: new Date(local('2026-03-02T14:00:00')).toISOString(), actualEnd: new Date(local('2026-03-02T15:30:00')).toISOString(),
  status: 'completed', createdAt: '', ...partial,
});

const arc: Arc = { id: 'a1', name: 'School', colorHex: '#ff0000', description: '', status: 'active', createdAt: '' };
const entry = (partial: Partial<SessionNode>): SessionNode => ({
  sessionId: 's', nodeId: 'n1', sortOrder: 0, status: 'done', timeStarted: null, timeFinished: null, totalMinutes: null, title: 'Node',
  nodeType: 'task', arcId: 'a1', projectId: null, arcName: 'School', arcColor: '#ff0000', ...partial,
});
const iso = (text: string) => new Date(local(text)).toISOString();

const blocks = (nodes: PlannerNode[], sessions: WorkSession[] = [], now = local('2026-03-02T12:00:00'), sessionNodes: SessionNode[] = [], sleepEntries: SleepEntry[] = []) =>
  clockBlocks({ nodes, sessions, sessionNodes, sleepEntries, arcs: [arc], projects: [{ id: 'p1', arcId: 'a1', name: 'P', description: '', status: 'active', startDate: null, endDate: null, createdAt: '' }] }, DAY_START, DAY_END, now);

// Timed nodes: color from the arc (own, else the project's, else grey), length from the estimate, local wall-clock start.
const [lecture, run, task] = blocks([
  node({ id: 'e', title: 'Lecture', nodeType: 'event', estimatedDurationMinutes: 75, arcId: 'a1' }),
  node({ id: 'r', title: 'Run', isRoutine: true, plannedStartAt: '2026-03-02T07:00:00', projectId: 'p1' }),
  node({ id: 't', title: 'Write', plannedStartAt: '2026-03-02T16:30:00', estimatedDurationMinutes: null }),
]);
equal([lecture.lane, lecture.endMs - lecture.startMs], ['planned', 75 * MINUTE], 'events keep their duration');
equal(lecture.startMs, local('2026-03-02T10:00:00'), 'planned_start_at is read as local time');
equal([lecture.color, run.color, task.color], ['#ff0000', '#ff0000', '#b0b0a8'], 'own arc, project arc, then grey');
equal(task.endMs - task.startMs, 30 * MINUTE, 'no estimate falls back to 30 minutes');
equal(lecture.label, 'Lecture · 10:00–11:15', 'labels carry the time range');

// Date-only and out-of-range nodes are not drawn.
equal(blocks([node({ plannedStartAt: '2026-03-02' })]).length, 0, 'a date-only node has no time to draw');
equal(blocks([node({ plannedStartAt: '2026-03-05T10:00:00' })]).length, 0, 'a node outside the range is skipped');
equal(blocks([node({ plannedStartAt: '2026-03-01T23:30:00', estimatedDurationMinutes: 60 })]).length, 1, 'a block crossing into the range is kept');

// Sessions: actual lane, live one runs to now, unstarted and zero-length ones are skipped.
const [done] = blocks([], [session({})]);
equal([done.lane, done.label], ['actual', '20260302-library @Library · 14:00–15:30'], 'a finished session');
const now = local('2026-03-02T14:20:00');
const [live] = blocks([], [session({ actualEnd: null, status: 'active' })], now);
equal(live.endMs, now, 'a live session runs up to now');
// Node bars: finished ones end at time_finished, unfinished ones run their minutes, then the session's end; clipped to the session.
const [withBars] = blocks([], [session({})], local('2026-03-02T12:00:00'), [
  entry({ nodeId: 'a', timeStarted: iso('2026-03-02T14:00:00'), timeFinished: iso('2026-03-02T14:20:00') }),
  entry({ nodeId: 'b', timeStarted: iso('2026-03-02T14:20:00'), totalMinutes: 30 }),
  entry({ nodeId: 'c', timeStarted: iso('2026-03-02T15:00:00'), arcColor: null }),
  entry({ nodeId: 'd', timeStarted: null }),
  entry({ sessionId: 'other', nodeId: 'e', timeStarted: iso('2026-03-02T14:00:00') }),
]);
equal(withBars.segments.map((x) => [x.id, (x.endMs - x.startMs) / MINUTE, x.isFinished, x.color]), [
  ['a', 20, true, '#ff0000'], ['b', 30, false, '#ff0000'], ['c', 30, false, '#b0b0a8'],
], 'one bar per started node of this session');
equal(blocks([], [session({ actualStart: null, status: 'planned' })]).length, 0, 'a session that never started is skipped');
equal(blocks([], [session({ actualEnd: null, status: 'interrupted' })]).length, 0, 'an ended-without-time session has no length');

// Sleep: one block across both lanes, drawn first so anything overlapping it sits on top; a night crossing midnight is kept.
const night = (partial: Partial<SleepEntry>): SleepEntry => ({ id: 1, date: '2026-03-01', sleepStart: '2026-03-01T23:30:00', wakeTime: '2026-03-02T07:00:00', notes: '', ...partial });
const [sleep, firstNode] = blocks([node({ id: 'n9' })], [], local('2026-03-02T12:00:00'), [], [night({})]);
equal([sleep.lane, sleep.startMs, sleep.endMs, sleep.label], ['sleep', local('2026-03-01T23:30:00'), local('2026-03-02T07:00:00'), 'Sleep · 23:30–07:00 · 7h 30m'], 'a night is one sleep block');
equal(firstNode.lane, 'planned', 'sleep is listed first so it is drawn underneath');
equal(blocks([], [], local('2026-03-02T12:00:00'), [], [night({ sleepStart: '2026-03-02T07:00:00', wakeTime: '2026-03-02T07:00:00' })]).length, 0, 'a zero-length night is skipped');
equal(blocks([], [], local('2026-03-02T12:00:00'), [], [night({ date: '2026-02-20', sleepStart: '2026-02-20T23:00:00', wakeTime: '2026-02-21T07:00:00' })]).length, 0, 'a night outside the range is skipped');

console.log('clockBlocks: ok');
