import { ulid } from 'ulid';
import type { CanvasCard, CanvasDocument } from '../vault/canvasTypes';
import { DEFAULT_CARD_HEIGHT, DEFAULT_CARD_WIDTH } from './canvasConstants';
import type { Point } from './canvasGeometry';

/**
 * Finds the existing ghost card for `title` on this board, or creates one
 * at `position` — the confirmed dedup rule: every arrow pointing at the
 * same not-yet-created title shares one placeholder card, so promoting it
 * (`promoteCard.ts`) resolves every arrow that targets it at once. Matching
 * is an exact title match, the same equality `resolveLinkTarget`
 * (`aliasResolution.ts`) uses for an ordinary `[[wikilink]]`.
 *
 * Immutable: returns a new `CanvasDocument` (or the same one, unchanged,
 * when reusing an existing ghost) plus the resolved card's id — never
 * mutates `doc` in place.
 */
export function findOrCreateGhost(
  doc: CanvasDocument,
  title: string,
  position: Point,
): { doc: CanvasDocument; cardId: string } {
  const existing = doc.cards.find((card) => card.content.type === 'ghost' && card.content.title === title);
  if (existing) return { doc, cardId: existing.id };

  const ghost: CanvasCard = {
    id: ulid(),
    x: position.x,
    y: position.y,
    w: DEFAULT_CARD_WIDTH,
    h: DEFAULT_CARD_HEIGHT,
    content: { type: 'ghost', title },
  };
  return { doc: { ...doc, cards: [...doc.cards, ghost] }, cardId: ghost.id };
}
