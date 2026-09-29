import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../db/client';
import { logUsageEvent } from '../db/usageEvents';
import { dirname } from '../vault/noteTitle';
import { syncFile } from '../vault/syncEngine';
import type { CanvasDocument } from '../vault/canvasTypes';

const MAX_DERIVED_TITLE_LENGTH = 80;
const FALLBACK_TITLE = 'Untitled';

/** First non-blank line of an inline card's body, heading marker and
 *  filesystem-unsafe characters stripped, as a starting title. */
function deriveTitleFromBody(body: string): string {
  const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? '';
  const stripped = firstLine.replace(/^#{1,6}\s+/, '').trim();
  const sanitized = stripped
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized.slice(0, MAX_DERIVED_TITLE_LENGTH).trim() || FALLBACK_TITLE;
}

/** Appends " 2", " 3", ... until `folder/title.md` names a path with no
 *  live note already indexed there — a derived title (unlike createNote's
 *  always-unique timestamped default) can plausibly collide. */
async function uniqueNotePath(vaultRoot: string, folder: string, title: string): Promise<string> {
  const db = await getDb(vaultRoot);
  const base = folder ? `${folder}/${title}` : title;
  let candidate = `${base}.md`;
  let suffix = 2;
  for (;;) {
    const rows = await db.select<{ id: string }[]>(
      'SELECT id FROM notes WHERE path = ? AND is_deleted = 0',
      [candidate],
    );
    if (rows.length === 0) return candidate;
    candidate = `${base} ${suffix}.md`;
    suffix += 1;
  }
}

/**
 * Promotes a card's content into a standalone `.md` note, in the same
 * folder as the canvas itself (confirmed design decision). Works for both
 * an inline card (its body becomes the note's initial content, titled from
 * its own first line/heading) and a ghost card (the note starts empty,
 * titled from the ghost's already-known title) — the ghost case is also how
 * clicking a ghost card resolves it: every arrow pointing at that one
 * deduped ghost now resolves through the same new `content.path`.
 *
 * Returns a new `CanvasDocument` with the card mutated to
 * `{type: 'note', path}` — never mutates `doc` in place; the caller
 * persists the result through the normal autosave path (CanvasView.tsx).
 * A no-op (returns `doc` unchanged) for a card that's already a note, or
 * one that no longer exists.
 */
export async function promoteCard(
  vaultRoot: string,
  canvasRelativePath: string,
  doc: CanvasDocument,
  cardId: string,
): Promise<CanvasDocument> {
  const card = doc.cards.find((c) => c.id === cardId);
  if (!card || (card.content.type !== 'inline' && card.content.type !== 'ghost')) return doc;

  const title = card.content.type === 'ghost' ? card.content.title : deriveTitleFromBody(card.content.body);
  const initialBody = card.content.type === 'inline' ? card.content.body : '';

  const folder = dirname(canvasRelativePath);
  const relativePath = await uniqueNotePath(vaultRoot, folder, title);
  const absolutePath = `${vaultRoot}/${relativePath}`;

  await invoke('write_note', { path: absolutePath, content: initialBody });
  await syncFile(vaultRoot, absolutePath);
  void logUsageEvent(vaultRoot, {
    type: 'create',
    path: relativePath,
    title,
    detail: { kind: 'promoted-from-canvas' },
  }).catch((error: unknown) => console.error('[usage] failed to log event', error));

  return {
    ...doc,
    cards: doc.cards.map((c) =>
      c.id === cardId ? { ...c, content: { type: 'note' as const, path: relativePath } } : c,
    ),
  };
}
