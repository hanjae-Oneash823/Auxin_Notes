import type Database from '@tauri-apps/plugin-sql';

export interface GraphNode {
  id: string;
  path: string;
  title: string;
  created: string;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
}

export interface GraphPosition {
  x: number;
  y: number;
}

/** Notes ordered by creation time — order (not the timestamp itself) becomes
 *  the graph's Z axis, so the caller only needs the array index. */
export async function getGraphNodes(db: Database): Promise<GraphNode[]> {
  return db.select<GraphNode[]>(
    'SELECT id, path, title, created FROM notes WHERE is_deleted = 0 ORDER BY created ASC',
  );
}

interface EdgeRow {
  source_id: string;
  target_id: string;
}

/** Resolved links only — an edge needs a real note on both ends. */
export async function getGraphEdges(db: Database): Promise<GraphEdge[]> {
  const rows = await db.select<EdgeRow[]>(
    `SELECT DISTINCT l.source_id, l.target_id FROM links l
     JOIN notes n ON n.id = l.source_id AND n.is_deleted = 0
     JOIN notes t ON t.id = l.target_id AND t.is_deleted = 0
     WHERE l.target_id IS NOT NULL`,
  );
  return rows.map((row) => ({ sourceId: row.source_id, targetId: row.target_id }));
}

interface PropertyRow {
  note_id: string;
  key: string;
  value: string;
}

/** Warm-start seed for the force layout — positions persisted from the last
 *  run, keyed by note id. Notes with no stored position (new since last run)
 *  are simply absent from the returned map. */
export async function getStoredPositions(db: Database): Promise<Map<string, GraphPosition>> {
  const rows = await db.select<PropertyRow[]>(
    "SELECT note_id, key, value FROM properties WHERE key IN ('graph_x', 'graph_y')",
  );

  const partial = new Map<string, { x?: number; y?: number }>();
  for (const row of rows) {
    const entry = partial.get(row.note_id) ?? {};
    if (row.key === 'graph_x') entry.x = Number(row.value);
    if (row.key === 'graph_y') entry.y = Number(row.value);
    partial.set(row.note_id, entry);
  }

  const positions = new Map<string, GraphPosition>();
  for (const [noteId, entry] of partial) {
    if (entry.x !== undefined && entry.y !== undefined) {
      positions.set(noteId, { x: entry.x, y: entry.y });
    }
  }
  return positions;
}

export async function savePositions(db: Database, positions: Map<string, GraphPosition>): Promise<void> {
  for (const [noteId, position] of positions) {
    await db.execute('INSERT OR REPLACE INTO properties (note_id, key, value) VALUES (?, ?, ?)', [
      noteId,
      'graph_x',
      String(position.x),
    ]);
    await db.execute('INSERT OR REPLACE INTO properties (note_id, key, value) VALUES (?, ?, ?)', [
      noteId,
      'graph_y',
      String(position.y),
    ]);
  }
}
