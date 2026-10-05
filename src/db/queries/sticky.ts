import type Database from '@tauri-apps/plugin-sql';
import { ulid } from 'ulid';

export type StickyNoteType = 'text' | 'checklist';

export interface StickyChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  position: number;
}

export interface StickyNote {
  id: string;
  type: StickyNoteType;
  title: string | null;
  content: string;
  color: string;
  boardX: number | null;
  boardY: number | null;
  created: string;
  modified: string;
  items: StickyChecklistItem[];
}

interface StickyNoteRow {
  id: string;
  type: string;
  title: string | null;
  content: string;
  color: string;
  board_x: number | null;
  board_y: number | null;
  created: string;
  modified: string;
}

interface StickyItemRow {
  id: string;
  note_id: string;
  text: string;
  checked: number;
  position: number;
}

function toStickyNote(row: StickyNoteRow, items: StickyChecklistItem[]): StickyNote {
  return {
    id: row.id,
    type: row.type === 'checklist' ? 'checklist' : 'text',
    title: row.title,
    content: row.content,
    color: row.color,
    boardX: row.board_x,
    boardY: row.board_y,
    created: row.created,
    modified: row.modified,
    items,
  };
}

/** All sticky notes with their checklist items attached — the whole board
 *  and dock are small enough (fridge-note scale, not vault scale) that
 *  loading everything at once beats a paginated/lazy query. */
export async function listStickyNotes(db: Database): Promise<StickyNote[]> {
  const [noteRows, itemRows] = await Promise.all([
    db.select<StickyNoteRow[]>('SELECT * FROM sticky_notes ORDER BY created ASC'),
    db.select<StickyItemRow[]>('SELECT * FROM sticky_note_items ORDER BY note_id, position ASC'),
  ]);

  const itemsByNote = new Map<string, StickyChecklistItem[]>();
  for (const row of itemRows) {
    const items = itemsByNote.get(row.note_id) ?? [];
    items.push({ id: row.id, text: row.text, checked: row.checked === 1, position: row.position });
    itemsByNote.set(row.note_id, items);
  }

  return noteRows.map((row) => toStickyNote(row, itemsByNote.get(row.id) ?? []));
}

export interface CreateStickyNoteInput {
  type: StickyNoteType;
  title?: string | null;
  content?: string;
  color?: string;
  /** For a fresh 'checklist' note created from the quick-capture modal —
   *  one item per line of the initial input. */
  itemTexts?: string[];
}

export async function createStickyNote(db: Database, input: CreateStickyNoteInput): Promise<StickyNote> {
  const id = ulid();
  const now = new Date().toISOString();
  const title = input.title ?? null;
  const content = input.content ?? '';
  const color = input.color ?? 'yellow';

  await db.execute(
    `INSERT INTO sticky_notes (id, type, title, content, color, board_x, board_y, created, modified)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    [id, input.type, title, content, color, now, now],
  );

  const items: StickyChecklistItem[] = [];
  for (const [position, text] of (input.itemTexts ?? []).entries()) {
    const itemId = ulid();
    await db.execute('INSERT INTO sticky_note_items (id, note_id, text, checked, position) VALUES (?, ?, ?, 0, ?)', [
      itemId,
      id,
      text,
      position,
    ]);
    items.push({ id: itemId, text, checked: false, position });
  }

  return {
    id,
    type: input.type,
    title,
    content,
    color,
    boardX: null,
    boardY: null,
    created: now,
    modified: now,
    items,
  };
}

export interface UpdateStickyNoteInput {
  title?: string | null;
  content?: string;
  color?: string;
}

export async function updateStickyNote(db: Database, id: string, input: UpdateStickyNoteInput): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) {
    fields.push('title = ?');
    values.push(input.title);
  }
  if (input.content !== undefined) {
    fields.push('content = ?');
    values.push(input.content);
  }
  if (input.color !== undefined) {
    fields.push('color = ?');
    values.push(input.color);
  }
  if (fields.length === 0) return;

  fields.push('modified = ?');
  values.push(new Date().toISOString());
  values.push(id);

  await db.execute(`UPDATE sticky_notes SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteStickyNote(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM sticky_notes WHERE id = ?', [id]);
}

export async function updateBoardPosition(db: Database, id: string, x: number, y: number): Promise<void> {
  await db.execute('UPDATE sticky_notes SET board_x = ?, board_y = ? WHERE id = ?', [x, y, id]);
}

export async function addChecklistItem(db: Database, noteId: string, text: string, position: number): Promise<StickyChecklistItem> {
  const id = ulid();
  await db.execute('INSERT INTO sticky_note_items (id, note_id, text, checked, position) VALUES (?, ?, ?, 0, ?)', [
    id,
    noteId,
    text,
    position,
  ]);
  return { id, text, checked: false, position };
}

export async function toggleChecklistItem(db: Database, itemId: string, checked: boolean): Promise<void> {
  await db.execute('UPDATE sticky_note_items SET checked = ? WHERE id = ?', [checked ? 1 : 0, itemId]);
}

export async function updateChecklistItemText(db: Database, itemId: string, text: string): Promise<void> {
  await db.execute('UPDATE sticky_note_items SET text = ? WHERE id = ?', [text, itemId]);
}

export async function deleteChecklistItem(db: Database, itemId: string): Promise<void> {
  await db.execute('DELETE FROM sticky_note_items WHERE id = ?', [itemId]);
}

export async function reorderChecklistItems(db: Database, orderedItemIds: string[]): Promise<void> {
  for (const [position, itemId] of orderedItemIds.entries()) {
    await db.execute('UPDATE sticky_note_items SET position = ? WHERE id = ?', [position, itemId]);
  }
}
