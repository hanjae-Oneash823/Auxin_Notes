import type Database from '@tauri-apps/plugin-sql';
import { ulid } from 'ulid';
import type { Sprint, SprintStatus } from './types.ts';
import { nowIso, patchRow } from './util.ts';

interface SprintRow {
  id: string;
  name: string;
  arc_id: string | null;
  project_id: string | null;
  status: SprintStatus;
  sort_order: number | null;
  created_at: string;
}

const toSprint = (row: SprintRow): Sprint => ({
  id: row.id, name: row.name, arcId: row.arc_id, projectId: row.project_id, status: row.status, sortOrder: row.sort_order, createdAt: row.created_at,
});

/** Hand-ranked first; never-ranked sprints follow in creation order. */
export async function listSprints(db: Database): Promise<Sprint[]> {
  const rows = await db.select<SprintRow[]>('SELECT * FROM sprints ORDER BY sort_order IS NULL, sort_order ASC, created_at ASC');
  return rows.map(toSprint);
}

export interface NewSprintInput {
  name: string;
  arcId?: string | null;
  projectId?: string | null;
}

/** Appends to the bottom of the ranking. */
export async function createSprint(db: Database, input: NewSprintInput): Promise<Sprint> {
  const [{ last }] = await db.select<{ last: number }[]>('SELECT COALESCE(MAX(sort_order), 0) AS last FROM sprints');
  const sprint: Sprint = {
    id: ulid(), name: input.name, arcId: input.arcId ?? null, projectId: input.projectId ?? null,
    status: 'active', sortOrder: last + 1, createdAt: nowIso(),
  };
  await db.execute('INSERT INTO sprints (id, name, arc_id, project_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    sprint.id, sprint.name, sprint.arcId, sprint.projectId, sprint.status, sprint.sortOrder, sprint.createdAt,
  ]);
  return sprint;
}

export type SprintPatch = Partial<Pick<Sprint, 'name' | 'arcId' | 'projectId' | 'status'>>;

export async function updateSprint(db: Database, id: string, patch: SprintPatch): Promise<void> {
  await patchRow(db, 'sprints', id, { name: patch.name, arc_id: patch.arcId, project_id: patch.projectId, status: patch.status });
}

/** Stores the ranking: the first id gets 1, the next 2, and so on. */
export async function setSprintOrder(db: Database, orderedIds: readonly string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await db.execute('UPDATE sprints SET sort_order = ? WHERE id = ?', [index + 1, id]);
  }
}
