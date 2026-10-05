import type Database from '@tauri-apps/plugin-sql';
import { ulid } from 'ulid';
import type { PlannerGroup } from './types.ts';
import { nowIso, patchRow, placeholders, toBool } from './util.ts';

// Mycelium kept every node in at least one group with two SQL triggers: a node
// with no real group sits in the system "ungrouped" group, and gaining a real
// group drops it. The migration runner can't split trigger bodies, so the same
// invariant is enforced here instead, in setNodeGroups and restoreUngrouped.

interface GroupRow {
  id: string;
  name: string;
  color_hex: string;
  sort_order: number;
  is_ungrouped: number;
  created_at: string;
}

const toGroup = (row: GroupRow): PlannerGroup => ({
  id: row.id, name: row.name, colorHex: row.color_hex, sortOrder: row.sort_order,
  isUngrouped: toBool(row.is_ungrouped), createdAt: row.created_at,
});

const DEFAULT_GROUP_COLOR = '#64c8ff';

export async function listGroups(db: Database): Promise<PlannerGroup[]> {
  const rows = await db.select<GroupRow[]>('SELECT * FROM planner_groups ORDER BY sort_order ASC, created_at ASC');
  return rows.map(toGroup);
}

export async function getUngroupedId(db: Database): Promise<string | null> {
  const rows = await db.select<{ id: string }[]>('SELECT id FROM planner_groups WHERE is_ungrouped = 1 LIMIT 1');
  return rows[0]?.id ?? null;
}

export interface NewGroupInput {
  name: string;
  colorHex?: string;
}

export async function createGroup(db: Database, input: NewGroupInput): Promise<PlannerGroup> {
  const [{ next }] = await db.select<{ next: number }[]>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM planner_groups');
  const group: PlannerGroup = {
    id: ulid(), name: input.name, colorHex: input.colorHex ?? DEFAULT_GROUP_COLOR, sortOrder: next, isUngrouped: false, createdAt: nowIso(),
  };
  await db.execute('INSERT INTO planner_groups (id, name, color_hex, sort_order, is_ungrouped, created_at) VALUES (?, ?, ?, ?, 0, ?)', [
    group.id, group.name, group.colorHex, group.sortOrder, group.createdAt,
  ]);
  return group;
}

export type GroupPatch = Partial<Pick<PlannerGroup, 'name' | 'colorHex' | 'sortOrder'>>;

export async function updateGroup(db: Database, id: string, patch: GroupPatch): Promise<void> {
  await patchRow(db, 'planner_groups', id, { name: patch.name, color_hex: patch.colorHex, sort_order: patch.sortOrder });
}

/** Puts every node left without any group back into "ungrouped". */
export async function restoreUngrouped(db: Database): Promise<void> {
  const ungroupedId = await getUngroupedId(db);
  if (!ungroupedId) return;
  await db.execute(
    `INSERT OR IGNORE INTO node_groups (node_id, group_id)
     SELECT n.id, ? FROM nodes n WHERE NOT EXISTS (SELECT 1 FROM node_groups g WHERE g.node_id = n.id)`,
    [ungroupedId],
  );
}

/** Deleting a group detaches it from its nodes and routines; orphaned nodes fall back to "ungrouped". */
export async function deleteGroup(db: Database, id: string): Promise<void> {
  if (id === (await getUngroupedId(db))) throw new Error('The system "ungrouped" group cannot be deleted.');
  await db.execute('DELETE FROM planner_groups WHERE id = ?', [id]);
  await restoreUngrouped(db);
}

/**
 * Replaces a node's groups. Real groups replace "ungrouped"; an empty list
 * puts the node back in it. Adds first and prunes after, so a failure part-way
 * leaves extra memberships rather than a node with none.
 */
export async function setNodeGroups(db: Database, nodeId: string, groupIds: readonly string[]): Promise<void> {
  const ungroupedId = await getUngroupedId(db);
  const real = [...new Set(groupIds.filter((id) => id !== ungroupedId))];
  const wanted = real.length > 0 ? real : ungroupedId ? [ungroupedId] : [];

  for (const groupId of wanted) {
    await db.execute('INSERT OR IGNORE INTO node_groups (node_id, group_id) VALUES (?, ?)', [nodeId, groupId]);
  }
  if (wanted.length === 0) {
    await db.execute('DELETE FROM node_groups WHERE node_id = ?', [nodeId]);
    return;
  }
  await db.execute(`DELETE FROM node_groups WHERE node_id = ? AND group_id NOT IN (${placeholders(wanted.length)})`, [nodeId, ...wanted]);
}

/** node id → group ids, for every node. */
export async function listNodeGroupIds(db: Database): Promise<Map<string, string[]>> {
  const rows = await db.select<{ node_id: string; group_id: string }[]>('SELECT node_id, group_id FROM node_groups');
  const byNode = new Map<string, string[]>();
  for (const { node_id, group_id } of rows) byNode.set(node_id, [...(byNode.get(node_id) ?? []), group_id]);
  return byNode;
}
