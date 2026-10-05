import type Database from '@tauri-apps/plugin-sql';
import { ulid } from 'ulid';
import type { Arc, EntityStatus, Project } from './types.ts';
import { nowIso, patchRow } from './util.ts';

interface ArcRow {
  id: string;
  name: string;
  color_hex: string;
  description: string;
  status: EntityStatus;
  created_at: string;
}

interface ProjectRow {
  id: string;
  arc_id: string | null;
  name: string;
  description: string;
  status: EntityStatus;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

const toArc = (row: ArcRow): Arc => ({
  id: row.id, name: row.name, colorHex: row.color_hex, description: row.description, status: row.status, createdAt: row.created_at,
});

const toProject = (row: ProjectRow): Project => ({
  id: row.id, arcId: row.arc_id, name: row.name, description: row.description, status: row.status,
  startDate: row.start_date, endDate: row.end_date, createdAt: row.created_at,
});

const DEFAULT_ARC_COLOR = '#00c4a7';

// ── Arcs ──────────────────────────────────────────────────────────────────────

export async function listArcs(db: Database): Promise<Arc[]> {
  const rows = await db.select<ArcRow[]>('SELECT * FROM arcs ORDER BY created_at ASC');
  return rows.map(toArc);
}

export interface NewArcInput {
  name: string;
  colorHex?: string;
  description?: string;
}

export async function createArc(db: Database, input: NewArcInput): Promise<Arc> {
  const arc: Arc = {
    id: ulid(), name: input.name, colorHex: input.colorHex ?? DEFAULT_ARC_COLOR,
    description: input.description ?? '', status: 'active', createdAt: nowIso(),
  };
  await db.execute('INSERT INTO arcs (id, name, color_hex, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    arc.id, arc.name, arc.colorHex, arc.description, arc.status, arc.createdAt,
  ]);
  return arc;
}

export type ArcPatch = Partial<Pick<Arc, 'name' | 'colorHex' | 'description' | 'status'>>;

export async function updateArc(db: Database, id: string, patch: ArcPatch): Promise<void> {
  await patchRow(db, 'arcs', id, { name: patch.name, color_hex: patch.colorHex, description: patch.description, status: patch.status });
}

/** Projects, nodes and routines under the arc keep existing with arc_id set to NULL. */
export async function deleteArc(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM arcs WHERE id = ?', [id]);
}

/** Sets the arc's status and gives every project in it the same one. */
export async function cascadeArcStatus(db: Database, id: string, status: EntityStatus): Promise<void> {
  await db.execute('UPDATE arcs SET status = ? WHERE id = ?', [status, id]);
  await db.execute('UPDATE projects SET status = ? WHERE arc_id = ?', [status, id]);
}

/** Deletes the arc and its projects; their nodes and routines keep existing with arc/project set to NULL. */
export async function deleteArcWithProjects(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM projects WHERE arc_id = ?', [id]);
  await db.execute('DELETE FROM arcs WHERE id = ?', [id]);
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function listProjects(db: Database): Promise<Project[]> {
  const rows = await db.select<ProjectRow[]>('SELECT * FROM projects ORDER BY created_at ASC');
  return rows.map(toProject);
}

export interface NewProjectInput {
  name: string;
  arcId?: string | null;
  description?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export async function createProject(db: Database, input: NewProjectInput): Promise<Project> {
  const project: Project = {
    id: ulid(), arcId: input.arcId ?? null, name: input.name, description: input.description ?? '', status: 'active',
    startDate: input.startDate ?? null, endDate: input.endDate ?? null, createdAt: nowIso(),
  };
  await db.execute(
    'INSERT INTO projects (id, arc_id, name, description, status, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [project.id, project.arcId, project.name, project.description, project.status, project.startDate, project.endDate, project.createdAt],
  );
  return project;
}

export type ProjectPatch = Partial<Pick<Project, 'name' | 'arcId' | 'description' | 'status' | 'startDate' | 'endDate'>>;

export async function updateProject(db: Database, id: string, patch: ProjectPatch): Promise<void> {
  await patchRow(db, 'projects', id, {
    name: patch.name, arc_id: patch.arcId, description: patch.description, status: patch.status,
    start_date: patch.startDate, end_date: patch.endDate,
  });
}

export async function deleteProject(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM projects WHERE id = ?', [id]);
}
