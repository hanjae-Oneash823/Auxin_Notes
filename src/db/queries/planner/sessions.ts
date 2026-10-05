import type Database from '@tauri-apps/plugin-sql';
import { ulid } from 'ulid';
import { setNodeCompleted } from './nodes.ts';
import type {
  NodeType, SessionNode, SessionNodeStatus, SessionPause, SessionStatus, UserCapacity, WorkLocation, WorkSession,
} from './types.ts';
import { nowIso, patchRow, placeholders, type SqlValue } from './util.ts';

const MINUTE_MS = 60_000;
const DEFAULT_SESSION_LIMIT = 60;
const DEFAULT_CAPACITY: UserCapacity = { id: 'default', dailyMinutes: 480, peakStart: '09:00', peakEnd: '12:00', updatedAt: '' };

// ── Locations ─────────────────────────────────────────────────────────────────

export async function listLocations(db: Database): Promise<WorkLocation[]> {
  const rows = await db.select<{ id: string; name: string; created_at: string }[]>('SELECT * FROM work_locations ORDER BY name ASC');
  return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
}

export async function createLocation(db: Database, name: string): Promise<WorkLocation> {
  const location: WorkLocation = { id: ulid(), name, createdAt: nowIso() };
  await db.execute('INSERT INTO work_locations (id, name, created_at) VALUES (?, ?, ?)', [location.id, name, location.createdAt]);
  return location;
}

/** Sessions that used the location keep existing with location_id set to NULL. */
export async function deleteLocation(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM work_locations WHERE id = ?', [id]);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  title: string;
  location_id: string | null;
  location_name: string | null;
  planned_date: string;
  actual_start: string | null;
  actual_end: string | null;
  status: SessionStatus;
  created_at: string;
}

const toSession = (row: SessionRow): WorkSession => ({
  id: row.id, title: row.title, locationId: row.location_id, locationName: row.location_name, plannedDate: row.planned_date,
  actualStart: row.actual_start, actualEnd: row.actual_end, status: row.status, createdAt: row.created_at,
});

const SESSION_SELECT = `
  SELECT ws.*, wl.name AS location_name
  FROM work_sessions ws
  LEFT JOIN work_locations wl ON wl.id = ws.location_id`;

async function querySessions(db: Database, clause: string, params: SqlValue[] = []): Promise<WorkSession[]> {
  const rows = await db.select<SessionRow[]>(`${SESSION_SELECT} ${clause}`, params);
  return rows.map(toSession);
}

export async function getActiveSession(db: Database): Promise<WorkSession | null> {
  return (await querySessions(db, "WHERE ws.status IN ('active','paused') LIMIT 1"))[0] ?? null;
}

export const listSessionsOn = (db: Database, plannedDate: string): Promise<WorkSession[]> =>
  querySessions(db, 'WHERE ws.planned_date = ? ORDER BY ws.created_at ASC', [plannedDate]);

/** Started sessions whose planned date falls in [from, to]. */
export const listStartedSessionsBetween = (db: Database, from: string, to: string): Promise<WorkSession[]> =>
  querySessions(db, 'WHERE ws.actual_start IS NOT NULL AND ws.planned_date >= ? AND ws.planned_date <= ? ORDER BY ws.actual_start ASC', [from, to]);

export const listRecentSessions = (db: Database, limit = DEFAULT_SESSION_LIMIT): Promise<WorkSession[]> =>
  querySessions(db, 'ORDER BY ws.planned_date DESC, ws.created_at DESC LIMIT ?', [limit]);

export const listStartedSessions = (db: Database): Promise<WorkSession[]> =>
  querySessions(db, 'WHERE ws.actual_start IS NOT NULL ORDER BY ws.actual_start ASC');

/** `yyyymmdd-location-slug`, suffixed -01, -02… when the same title already exists. */
export async function generateSessionTitle(db: Database, locationId: string, plannedDate: string): Promise<string> {
  const [location] = await db.select<{ name: string }[]>('SELECT name FROM work_locations WHERE id = ?', [locationId]);
  const slug = location ? location.name.toLowerCase().replace(/\s+/g, '-') : 'session';
  const base = `${plannedDate.replace(/-/g, '')}-${slug}`;
  const existing = await db.select<{ title: string }[]>('SELECT title FROM work_sessions WHERE title LIKE ?', [`${base}%`]);
  if (existing.length === 0) return base;
  const highest = existing.reduce((max, row) => Math.max(max, Number(/-(\d{2})$/.exec(row.title)?.[1] ?? 0)), 0);
  return `${base}-${String(highest + 1).padStart(2, '0')}`;
}

export async function createSession(db: Database, locationId: string, plannedDate: string): Promise<WorkSession> {
  const id = ulid();
  const title = await generateSessionTitle(db, locationId, plannedDate);
  await db.execute('INSERT INTO work_sessions (id, title, location_id, planned_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    id, title, locationId, plannedDate, 'planned', nowIso(),
  ]);
  const [session] = await querySessions(db, 'WHERE ws.id = ?', [id]);
  return session;
}

/** Starting drops queued nodes that were already completed elsewhere in the planner. */
export async function startSession(db: Database, sessionId: string): Promise<void> {
  await db.execute("UPDATE work_sessions SET status = 'active', actual_start = ? WHERE id = ?", [nowIso(), sessionId]);
  await db.execute(
    'DELETE FROM session_nodes WHERE session_id = ? AND node_id IN (SELECT id FROM nodes WHERE is_completed = 1)',
    [sessionId],
  );
}

/** Returns the new pause's id; pass it to resumeSession. */
export async function pauseSession(db: Database, sessionId: string): Promise<string> {
  const pauseId = ulid();
  await db.execute("UPDATE work_sessions SET status = 'paused' WHERE id = ?", [sessionId]);
  await db.execute("INSERT INTO session_pauses (id, session_id, paused_at, pause_type) VALUES (?, ?, ?, 'manual')", [pauseId, sessionId, nowIso()]);
  return pauseId;
}

export async function resumeSession(db: Database, sessionId: string, pauseId: string): Promise<void> {
  await db.execute("UPDATE work_sessions SET status = 'active' WHERE id = ?", [sessionId]);
  await db.execute('UPDATE session_pauses SET resumed_at = ? WHERE id = ?', [nowIso(), pauseId]);
}

/** Ends the session at `endTime` and closes any pause still open. */
export async function endSession(
  db: Database,
  sessionId: string,
  status: 'completed' | 'interrupted',
  endTime: string = nowIso(),
): Promise<void> {
  await db.execute('UPDATE session_pauses SET resumed_at = ? WHERE session_id = ? AND resumed_at IS NULL', [endTime, sessionId]);
  await db.execute('UPDATE work_sessions SET status = ?, actual_end = ? WHERE id = ?', [status, endTime, sessionId]);
}

/** Ends the session as of `endTime` (which may be in the past — a session
 *  someone forgot to end) and makes everything else agree with it: pauses
 *  after it are dropped, a straddling pause is cut at it, in-progress nodes
 *  close as incomplete at it (or go back to the queue if they only started
 *  after it), and nodes finished after it are clamped to it. */
export async function endSessionAt(
  db: Database,
  sessionId: string,
  status: 'completed' | 'interrupted',
  endTime: string = nowIso(),
): Promise<void> {
  await db.execute('DELETE FROM session_pauses WHERE session_id = ? AND paused_at >= ?', [sessionId, endTime]);
  await db.execute('UPDATE session_pauses SET resumed_at = ? WHERE session_id = ? AND resumed_at > ?', [endTime, sessionId, endTime]);

  const nodes = await db.select<{ node_id: string; status: string; time_started: string | null; time_finished: string | null }[]>(
    "SELECT node_id, status, time_started, time_finished FROM session_nodes WHERE session_id = ? AND status IN ('in_progress','done')",
    [sessionId],
  );
  for (const node of nodes) {
    const startedAfterEnd = node.time_started !== null && node.time_started > endTime;
    if (node.status === 'in_progress') {
      if (startedAfterEnd) await returnNodeToQueue(db, sessionId, node.node_id);
      else await closeSessionNode(db, sessionId, node.node_id, node.time_started, 'incomplete', endTime);
    } else if (node.time_finished !== null && node.time_finished > endTime) {
      const started = node.time_started !== null && node.time_started < endTime ? node.time_started : endTime;
      await closeSessionNode(db, sessionId, node.node_id, started, 'done', endTime);
    }
  }
  await endSession(db, sessionId, status, endTime);
}

export async function setSessionEndTime(db: Database, sessionId: string, endTime: string): Promise<void> {
  await patchRow(db, 'work_sessions', sessionId, { actual_end: endTime });
}

/** Cascades to the session's pauses and node entries. */
export async function deleteSession(db: Database, sessionId: string): Promise<void> {
  await db.execute('DELETE FROM work_sessions WHERE id = ?', [sessionId]);
}

export async function listPauses(db: Database, sessionId: string): Promise<SessionPause[]> {
  const rows = await db.select<{ id: string; session_id: string; paused_at: string; resumed_at: string | null; pause_type: SessionPause['pauseType'] }[]>(
    'SELECT * FROM session_pauses WHERE session_id = ? ORDER BY paused_at ASC',
    [sessionId],
  );
  return rows.map((row) => ({ id: row.id, sessionId: row.session_id, pausedAt: row.paused_at, resumedAt: row.resumed_at, pauseType: row.pause_type }));
}

// ── Session nodes ─────────────────────────────────────────────────────────────

interface SessionNodeRow {
  session_id: string;
  node_id: string;
  sort_order: number;
  status: SessionNodeStatus;
  time_started: string | null;
  time_finished: string | null;
  total_minutes: number | null;
  title: string;
  node_type: NodeType;
  arc_id: string | null;
  project_id: string | null;
  arc_name: string | null;
  arc_color: string | null;
}

const toSessionNode = (row: SessionNodeRow): SessionNode => ({
  sessionId: row.session_id, nodeId: row.node_id, sortOrder: row.sort_order, status: row.status, timeStarted: row.time_started,
  timeFinished: row.time_finished, totalMinutes: row.total_minutes, title: row.title, nodeType: row.node_type,
  arcId: row.arc_id, projectId: row.project_id, arcName: row.arc_name, arcColor: row.arc_color,
});

const SESSION_NODE_SELECT = `
  SELECT sn.*, n.title, n.node_type, n.arc_id, n.project_id, a.name AS arc_name, a.color_hex AS arc_color
  FROM session_nodes sn
  JOIN nodes n ON n.id = sn.node_id
  LEFT JOIN arcs a ON a.id = n.arc_id`;

const SESSION_NODE_ORDER = "ORDER BY CASE sn.status WHEN 'in_progress' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END, sn.sort_order ASC";

/** In-progress first, then queued, then finished; each in queue order. */
export async function listSessionNodes(db: Database, sessionId: string): Promise<SessionNode[]> {
  const rows = await db.select<SessionNodeRow[]>(`${SESSION_NODE_SELECT} WHERE sn.session_id = ? ${SESSION_NODE_ORDER}`, [sessionId]);
  return rows.map(toSessionNode);
}

/** Every session's node entries in one query, for the session log. */
export async function listAllSessionNodes(db: Database): Promise<SessionNode[]> {
  const rows = await db.select<SessionNodeRow[]>(`${SESSION_NODE_SELECT} ${SESSION_NODE_ORDER}`);
  return rows.map(toSessionNode);
}

async function nextSortOrder(db: Database, sessionId: string): Promise<number> {
  const [row] = await db.select<{ max: number }[]>('SELECT COALESCE(MAX(sort_order), -1) AS max FROM session_nodes WHERE session_id = ?', [sessionId]);
  return row.max + 1;
}

/** A session works on one node at a time: the title of the node in progress (other than `exceptNodeId`), or null. */
async function inProgressTitle(db: Database, sessionId: string, exceptNodeId: string | null = null): Promise<string | null> {
  const rows = await db.select<{ title: string }[]>(
    `SELECT n.title FROM session_nodes sn JOIN nodes n ON n.id = sn.node_id
     WHERE sn.session_id = ? AND sn.status = 'in_progress' AND sn.node_id IS NOT ? LIMIT 1`,
    [sessionId, exceptNodeId],
  );
  return rows[0]?.title ?? null;
}

const busyError = (title: string): Error => new Error(`Finish or skip "${title}" before adding or starting another node.`);

/** The events among these node ids: sessions are for work to do, and an event happens on its own. */
async function eventsAmong(db: Database, nodeIds: readonly string[]): Promise<{ id: string; title: string }[]> {
  if (nodeIds.length === 0) return [];
  return db.select<{ id: string; title: string }[]>(`SELECT id, title FROM nodes WHERE node_type = 'event' AND id IN (${placeholders(nodeIds.length)})`, [...nodeIds]);
}

export async function addNodesToSession(db: Database, sessionId: string, nodeIds: readonly string[]): Promise<void> {
  const events = await eventsAmong(db, nodeIds);
  if (events.length > 0) throw new Error(`Events can't be added to a session: ${events.map((event) => event.title).join(', ')}`);
  const busy = await inProgressTitle(db, sessionId);
  if (busy !== null) throw busyError(busy);
  let order = await nextSortOrder(db, sessionId);
  for (const nodeId of nodeIds) {
    await db.execute('INSERT OR IGNORE INTO session_nodes (session_id, node_id, sort_order) VALUES (?, ?, ?)', [sessionId, nodeId, order++]);
  }
}

/** Minutes worked between two instants, minus any completed pauses that overlap them. */
async function netMinutes(db: Database, sessionId: string, timeStarted: string, timeFinished: string): Promise<number> {
  const pauses = await db.select<{ paused_at: string; resumed_at: string }[]>(
    `SELECT paused_at, resumed_at FROM session_pauses
     WHERE session_id = ? AND paused_at >= ? AND paused_at <= ? AND resumed_at IS NOT NULL`,
    [sessionId, timeStarted, timeFinished],
  );
  const startMs = new Date(timeStarted).getTime();
  const endMs = new Date(timeFinished).getTime();
  const pausedMs = pauses.reduce((sum, pause) => {
    const from = Math.max(new Date(pause.paused_at).getTime(), startMs);
    const to = Math.min(new Date(pause.resumed_at).getTime(), endMs);
    return sum + Math.max(0, to - from);
  }, 0);
  return Math.max(0, (endMs - startMs - pausedMs) / MINUTE_MS);
}

async function closeSessionNode(
  db: Database, sessionId: string, nodeId: string, timeStarted: string | null, status: 'done' | 'incomplete', now: string,
): Promise<void> {
  const minutes = timeStarted ? await netMinutes(db, sessionId, timeStarted, now) : 0;
  await db.execute(
    'UPDATE session_nodes SET status = ?, time_finished = ?, total_minutes = ? WHERE session_id = ? AND node_id = ?',
    [status, now, minutes, sessionId, nodeId],
  );
}

async function startedAt(db: Database, sessionId: string, nodeId: string): Promise<string | null> {
  const [row] = await db.select<{ time_started: string | null }[]>(
    'SELECT time_started FROM session_nodes WHERE session_id = ? AND node_id = ?',
    [sessionId, nodeId],
  );
  return row?.time_started ?? null;
}

export async function startNode(db: Database, sessionId: string, nodeId: string): Promise<void> {
  const busy = await inProgressTitle(db, sessionId, nodeId);
  if (busy !== null) throw busyError(busy);
  await db.execute(
    "UPDATE session_nodes SET status = 'in_progress', time_started = ? WHERE session_id = ? AND node_id = ?",
    [nowIso(), sessionId, nodeId],
  );
}

/** Finishing also completes the planner node. Unlike Mycelium it goes through
 *  setNodeCompleted, so the completion is logged to productivity_logs too. */
export async function finishNode(db: Database, sessionId: string, nodeId: string): Promise<void> {
  await closeSessionNode(db, sessionId, nodeId, await startedAt(db, sessionId, nodeId), 'done', nowIso());
  await setNodeCompleted(db, nodeId, true);
}

export async function markNodeIncomplete(db: Database, sessionId: string, nodeId: string): Promise<void> {
  await closeSessionNode(db, sessionId, nodeId, await startedAt(db, sessionId, nodeId), 'incomplete', nowIso());
}

export async function returnNodeToQueue(db: Database, sessionId: string, nodeId: string): Promise<void> {
  await db.execute("UPDATE session_nodes SET status = 'queued', time_started = NULL WHERE session_id = ? AND node_id = ?", [sessionId, nodeId]);
}

export async function removeNodeFromSession(db: Database, sessionId: string, nodeId: string): Promise<void> {
  await db.execute('DELETE FROM session_nodes WHERE session_id = ? AND node_id = ?', [sessionId, nodeId]);
}

async function inProgressNodes(db: Database, sessionId: string) {
  return db.select<{ node_id: string; time_started: string | null }[]>(
    "SELECT node_id, time_started FROM session_nodes WHERE session_id = ? AND status = 'in_progress'",
    [sessionId],
  );
}

/** Force-stop: in-progress nodes become incomplete and queued ones are dropped. */
export async function carryOverUnfinished(db: Database, sessionId: string): Promise<void> {
  const now = nowIso();
  for (const node of await inProgressNodes(db, sessionId)) {
    await closeSessionNode(db, sessionId, node.node_id, node.time_started, 'incomplete', now);
  }
  await db.execute("DELETE FROM session_nodes WHERE session_id = ? AND status = 'queued'", [sessionId]);
}

/** Force-stop into another session: unfinished nodes are re-queued there (or dropped when `toId` is null). */
export async function moveUnfinishedToSession(db: Database, fromId: string, toId: string | null): Promise<void> {
  // Checked before anything is closed, so a refusal leaves both sessions as they were.
  const busy = toId ? await inProgressTitle(db, toId) : null;
  if (busy !== null) throw busyError(busy);
  const now = nowIso();
  const unfinished = await db.select<{ node_id: string }[]>(
    "SELECT node_id FROM session_nodes WHERE session_id = ? AND status IN ('queued','in_progress')",
    [fromId],
  );
  for (const node of await inProgressNodes(db, fromId)) {
    await closeSessionNode(db, fromId, node.node_id, node.time_started, 'incomplete', now);
  }
  if (toId) {
    // Sessions logged before this rule may hold events; they are dropped rather than carried over.
    const eventIds = new Set((await eventsAmong(db, unfinished.map((row) => row.node_id))).map((event) => event.id));
    await addNodesToSession(db, toId, unfinished.map((row) => row.node_id).filter((id) => !eventIds.has(id)));
  }
  await db.execute("DELETE FROM session_nodes WHERE session_id = ? AND status = 'queued'", [fromId]);
}

export async function markAllNodesDone(db: Database, sessionId: string): Promise<void> {
  const now = nowIso();
  const open = await db.select<{ node_id: string; time_started: string | null }[]>(
    "SELECT node_id, time_started FROM session_nodes WHERE session_id = ? AND status IN ('in_progress','queued')",
    [sessionId],
  );
  for (const node of open) {
    await closeSessionNode(db, sessionId, node.node_id, node.time_started, 'done', now);
    await setNodeCompleted(db, node.node_id, true);
  }
}

// ── Analytics & capacity ──────────────────────────────────────────────────────

export interface ArcMinutes {
  arcName: string;
  arcColor: string;
  totalMinutes: number;
  taskCount: number;
}

const UNTRACKED_COLOR = '#666666';

/** Worked minutes per arc for sessions planned in [from, to]; nodes without an arc count as "untracked". */
export async function arcBreakdown(db: Database, from: string, to: string): Promise<ArcMinutes[]> {
  const rows = await db.select<{ arc_name: string; arc_color: string; total_minutes: number; task_count: number }[]>(
    `SELECT COALESCE(a.name, 'untracked') AS arc_name, COALESCE(a.color_hex, ?) AS arc_color,
            SUM(sn.total_minutes) AS total_minutes, COUNT(DISTINCT sn.node_id) AS task_count
     FROM session_nodes sn
     JOIN nodes n ON n.id = sn.node_id
     LEFT JOIN arcs a ON a.id = n.arc_id
     JOIN work_sessions ws ON ws.id = sn.session_id
     WHERE sn.total_minutes > 0 AND ws.planned_date >= ? AND ws.planned_date <= ?
     GROUP BY a.id, a.name, a.color_hex
     ORDER BY total_minutes DESC`,
    [UNTRACKED_COLOR, from, to],
  );
  return rows.map((row) => ({ arcName: row.arc_name, arcColor: row.arc_color, totalMinutes: row.total_minutes, taskCount: row.task_count }));
}

export async function getUserCapacity(db: Database): Promise<UserCapacity> {
  const [row] = await db.select<{ id: string; daily_minutes: number; peak_start: string; peak_end: string; updated_at: string }[]>(
    "SELECT * FROM user_capacity WHERE id = 'default' LIMIT 1",
  );
  return row
    ? { id: row.id, dailyMinutes: row.daily_minutes, peakStart: row.peak_start, peakEnd: row.peak_end, updatedAt: row.updated_at }
    : { ...DEFAULT_CAPACITY, updatedAt: nowIso() };
}

export async function setUserCapacity(db: Database, capacity: Pick<UserCapacity, 'dailyMinutes' | 'peakStart' | 'peakEnd'>): Promise<void> {
  await db.execute(
    `INSERT INTO user_capacity (id, daily_minutes, peak_start, peak_end, updated_at) VALUES ('default', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET daily_minutes = excluded.daily_minutes, peak_start = excluded.peak_start,
       peak_end = excluded.peak_end, updated_at = excluded.updated_at`,
    [capacity.dailyMinutes, capacity.peakStart, capacity.peakEnd, nowIso()],
  );
}
