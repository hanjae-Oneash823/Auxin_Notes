import type Database from '@tauri-apps/plugin-sql';
import { ulid } from 'ulid';
import { listNodeGroupIds, setNodeGroups } from './groups.ts';
import type { Importance, NodeEdge, NodeType, PlannerNode, Pool, SubTask } from './types.ts';
import { fromBool, nowIso, patchRow, toBool, type SqlValue } from './util.ts';

interface NodeRow {
  id: string;
  project_id: string | null;
  arc_id: string | null;
  title: string;
  node_type: NodeType;
  pool: Pool;
  planned_start_at: string | null;
  due_at: string | null;
  actual_completed_at: string | null;
  estimated_duration_minutes: number | null;
  importance_level: Importance;
  is_completed: number;
  is_locked: number;
  is_pinned: number;
  is_frog_pinned: number;
  is_routine: number;
  routine_id: string | null;
  created_at: string;
  updated_at: string;
  sub_total: number;
  sub_done: number;
}

const toNode = (row: NodeRow, groupIds: string[]): PlannerNode => ({
  id: row.id, projectId: row.project_id, arcId: row.arc_id, title: row.title, nodeType: row.node_type, pool: row.pool,
  plannedStartAt: row.planned_start_at, dueAt: row.due_at, actualCompletedAt: row.actual_completed_at,
  estimatedDurationMinutes: row.estimated_duration_minutes, importanceLevel: row.importance_level,
  isCompleted: toBool(row.is_completed), isLocked: toBool(row.is_locked), isPinned: toBool(row.is_pinned),
  isFrogPinned: toBool(row.is_frog_pinned), isRoutine: toBool(row.is_routine), routineId: row.routine_id,
  createdAt: row.created_at, updatedAt: row.updated_at, groupIds, subTotal: row.sub_total, subDone: row.sub_done,
});

const NODE_SELECT = `
  SELECT n.*,
    (SELECT COUNT(*) FROM sub_tasks s WHERE s.node_id = n.id) AS sub_total,
    (SELECT COUNT(*) FROM sub_tasks s WHERE s.node_id = n.id AND s.is_completed = 1) AS sub_done
  FROM nodes n`;

const optionalBool = (value: boolean | undefined): number | undefined => (value === undefined ? undefined : fromBool(value));

// ── Reading ───────────────────────────────────────────────────────────────────

export interface NodeQuery {
  isCompleted?: boolean;
  arcId?: string;
  projectId?: string;
  routineId?: string;
  /** Inclusive YYYY-MM-DD bounds on the date part of planned_start_at. */
  plannedFrom?: string;
  plannedTo?: string;
}

export async function listNodes(db: Database, query: NodeQuery = {}): Promise<PlannerNode[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  const add = (clause: string, value: SqlValue) => {
    where.push(clause);
    params.push(value);
  };
  if (query.isCompleted !== undefined) add('n.is_completed = ?', fromBool(query.isCompleted));
  if (query.arcId) add('n.arc_id = ?', query.arcId);
  if (query.projectId) add('n.project_id = ?', query.projectId);
  if (query.routineId) add('n.routine_id = ?', query.routineId);
  if (query.plannedFrom) add('substr(n.planned_start_at, 1, 10) >= ?', query.plannedFrom);
  if (query.plannedTo) add('substr(n.planned_start_at, 1, 10) <= ?', query.plannedTo);

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, groups] = await Promise.all([
    db.select<NodeRow[]>(`${NODE_SELECT} ${clause} ORDER BY n.planned_start_at IS NULL, n.planned_start_at ASC, n.created_at ASC`, params),
    listNodeGroupIds(db),
  ]);
  return rows.map((row) => toNode(row, groups.get(row.id) ?? []));
}

export async function getNode(db: Database, id: string): Promise<PlannerNode | null> {
  const [rows, groups] = await Promise.all([
    db.select<NodeRow[]>(`${NODE_SELECT} WHERE n.id = ?`, [id]),
    db.select<{ group_id: string }[]>('SELECT group_id FROM node_groups WHERE node_id = ?', [id]),
  ]);
  return rows[0] ? toNode(rows[0], groups.map((g) => g.group_id)) : null;
}

// ── Writing ───────────────────────────────────────────────────────────────────

export interface NewNodeInput {
  /** Lets the caller know the new row's id before the save finishes; a ULID is generated when omitted. */
  id?: string;
  title: string;
  nodeType?: NodeType;
  /** Defaults to 'hot'. */
  pool?: Pool;
  projectId?: string | null;
  arcId?: string | null;
  plannedStartAt?: string | null;
  dueAt?: string | null;
  estimatedDurationMinutes?: number | null;
  importanceLevel?: Importance;
  isRoutine?: boolean;
  routineId?: string | null;
  groupIds?: readonly string[];
  subTaskTitles?: readonly string[];
}

/** Inserts a node plus its groups and subtasks and returns the new id (no re-read). */
export async function insertNode(db: Database, input: NewNodeInput): Promise<string> {
  const id = input.id ?? ulid();
  const now = nowIso();
  await db.execute(
    `INSERT INTO nodes
       (id, project_id, arc_id, title, node_type, pool, planned_start_at, due_at, estimated_duration_minutes,
        importance_level, is_routine, routine_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.projectId ?? null, input.arcId ?? null, input.title, input.nodeType ?? 'task', input.pool ?? 'hot',
      input.plannedStartAt ?? null, input.dueAt ?? null, input.estimatedDurationMinutes ?? null,
      input.importanceLevel ?? 0, fromBool(input.isRoutine ?? false), input.routineId ?? null, now, now,
    ],
  );
  await setNodeGroups(db, id, input.groupIds ?? []);
  for (const [index, title] of (input.subTaskTitles ?? []).entries()) {
    await addSubTask(db, id, title, index);
  }
  return id;
}

export async function createNode(db: Database, input: NewNodeInput): Promise<PlannerNode> {
  const id = await insertNode(db, input);
  const node = await getNode(db, id);
  if (!node) throw new Error(`Node ${id} vanished right after insert`);
  return node;
}

export type NodePatch = Partial<Pick<
  PlannerNode,
  'title' | 'nodeType' | 'pool' | 'projectId' | 'arcId' | 'plannedStartAt' | 'dueAt' | 'estimatedDurationMinutes'
  | 'importanceLevel' | 'isLocked' | 'isPinned' | 'isFrogPinned'
>>;

/** Replaces Mycelium's `nodes_ts` trigger: every edit bumps updated_at. */
export async function updateNode(db: Database, id: string, patch: NodePatch): Promise<void> {
  await patchRow(db, 'nodes', id, {
    title: patch.title, node_type: patch.nodeType, pool: patch.pool, project_id: patch.projectId, arc_id: patch.arcId,
    planned_start_at: patch.plannedStartAt, due_at: patch.dueAt, estimated_duration_minutes: patch.estimatedDurationMinutes,
    importance_level: patch.importanceLevel, is_locked: optionalBool(patch.isLocked),
    is_pinned: optionalBool(patch.isPinned), is_frog_pinned: optionalBool(patch.isFrogPinned),
    updated_at: nowIso(),
  });
}

/** Completing logs a productivity_logs row; un-completing removes it (as Mycelium does). */
export async function setNodeCompleted(db: Database, id: string, isCompleted: boolean): Promise<void> {
  const now = nowIso();
  if (!isCompleted) {
    await db.execute('UPDATE nodes SET is_completed = 0, actual_completed_at = NULL, updated_at = ? WHERE id = ?', [now, id]);
    await db.execute('DELETE FROM productivity_logs WHERE node_id = ?', [id]);
    return;
  }
  const [row] = await db.select<{ is_completed: number }[]>('SELECT is_completed FROM nodes WHERE id = ?', [id]);
  if (!row || toBool(row.is_completed)) return;
  await db.execute('UPDATE nodes SET is_completed = 1, actual_completed_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  await db.execute('INSERT INTO productivity_logs (id, node_id, completed_at) VALUES (?, ?, ?)', [ulid(), id, now]);
}

/** Cascades to the node's groups, subtasks, dependency edges and session entries. */
export async function deleteNode(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM nodes WHERE id = ?', [id]);
}

// ── Subtasks ──────────────────────────────────────────────────────────────────

interface SubTaskRow {
  id: string;
  node_id: string;
  title: string;
  is_completed: number;
  sort_order: number;
  created_at: string;
}

const toSubTask = (row: SubTaskRow): SubTask => ({
  id: row.id, nodeId: row.node_id, title: row.title, isCompleted: toBool(row.is_completed),
  sortOrder: row.sort_order, createdAt: row.created_at,
});

export async function listSubTasks(db: Database, nodeId: string): Promise<SubTask[]> {
  const rows = await db.select<SubTaskRow[]>('SELECT * FROM sub_tasks WHERE node_id = ? ORDER BY sort_order ASC, created_at ASC', [nodeId]);
  return rows.map(toSubTask);
}

export async function addSubTask(db: Database, nodeId: string, title: string, sortOrder = 0): Promise<SubTask> {
  const subTask: SubTask = { id: ulid(), nodeId, title, isCompleted: false, sortOrder, createdAt: nowIso() };
  await db.execute('INSERT INTO sub_tasks (id, node_id, title, is_completed, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?)', [
    subTask.id, nodeId, title, sortOrder, subTask.createdAt,
  ]);
  return subTask;
}

export async function setSubTaskCompleted(db: Database, id: string, isCompleted: boolean): Promise<void> {
  await patchRow(db, 'sub_tasks', id, { is_completed: fromBool(isCompleted) });
}

export async function deleteSubTask(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM sub_tasks WHERE id = ?', [id]);
}

// ── Dependency edges ("tendrils") ─────────────────────────────────────────────

interface EdgeRow {
  id: string;
  project_id: string;
  source_id: string;
  target_id: string;
  created_at: string;
}

const toEdge = (row: EdgeRow): NodeEdge => ({
  id: row.id, projectId: row.project_id, sourceId: row.source_id, targetId: row.target_id, createdAt: row.created_at,
});

export async function listEdges(db: Database, projectId?: string): Promise<NodeEdge[]> {
  const rows = projectId
    ? await db.select<EdgeRow[]>('SELECT * FROM tendril_edges WHERE project_id = ?', [projectId])
    : await db.select<EdgeRow[]>('SELECT * FROM tendril_edges');
  return rows.map(toEdge);
}

export async function addEdge(db: Database, input: { projectId: string; sourceId: string; targetId: string }): Promise<NodeEdge> {
  const edge: NodeEdge = { id: ulid(), ...input, createdAt: nowIso() };
  await db.execute('INSERT INTO tendril_edges (id, project_id, source_id, target_id, created_at) VALUES (?, ?, ?, ?, ?)', [
    edge.id, edge.projectId, edge.sourceId, edge.targetId, edge.createdAt,
  ]);
  return edge;
}

export async function removeEdge(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM tendril_edges WHERE id = ?', [id]);
}
