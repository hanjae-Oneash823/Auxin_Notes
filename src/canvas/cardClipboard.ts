import { ulid } from 'ulid';
import type { CanvasArrow, CanvasCard } from '../vault/canvasTypes';
import type { Point } from './canvasGeometry';

/** Written to the system clipboard when cards are copied, so a later paste
 *  can tell "my cards are the latest thing copied" from "something else was
 *  copied since" (other text: leave it alone; an image: paste the image). */
export const CARD_CLIPBOARD_MARKER = 'auxin-canvas-cards';

interface CardClipboard {
  cards: CanvasCard[];
  arrows: CanvasArrow[];
  /** How many times this copy has been pasted, to step each paste aside. */
  pasteCount: number;
}

/** Module-level, so cards copied on one canvas paste into another. */
let clipboard: CardClipboard | null = null;

/** Ghost cards stand for a note that doesn't exist yet and are deduplicated by
 *  title per board, so a copy of one would break that. */
export function isCopyableCard(card: CanvasCard): boolean {
  return card.content.type !== 'ghost';
}

/** Remembers `cards` and the arrows that join two of them. */
export function copyToCardClipboard(cards: readonly CanvasCard[], arrows: readonly CanvasArrow[]): void {
  const copyable = cards.filter(isCopyableCard);
  if (copyable.length === 0) return;
  const ids = new Set(copyable.map((card) => card.id));
  clipboard = {
    cards: copyable,
    arrows: arrows.filter((arrow) => ids.has(arrow.fromCardId) && ids.has(arrow.toCardId)),
    pasteCount: 0,
  };
}

/** The copied cards if a paste of `systemText` should produce them: nothing on
 *  the system clipboard, or our marker. Other text means the user copied
 *  something else since. Counts the paste. */
export function takeCardClipboard(systemText: string): { cards: CanvasCard[]; arrows: CanvasArrow[]; pasteIndex: number } | null {
  if (!clipboard) return null;
  if (systemText !== '' && systemText !== CARD_CLIPBOARD_MARKER) return null;
  clipboard = { ...clipboard, pasteCount: clipboard.pasteCount + 1 };
  return { cards: clipboard.cards, arrows: clipboard.arrows, pasteIndex: clipboard.pasteCount };
}

/** New copies of `cards` (fresh ids), moved by `offset`, plus copies of the
 *  `arrows` between them rewired to the new ids. */
export function cloneCards(
  cards: readonly CanvasCard[],
  arrows: readonly CanvasArrow[],
  offset: Point,
): { cards: CanvasCard[]; arrows: CanvasArrow[] } {
  const newIdByOldId = new Map(cards.map((card) => [card.id, ulid()]));
  return {
    cards: cards.map((card) => ({ ...card, id: newIdByOldId.get(card.id) ?? card.id, x: card.x + offset.x, y: card.y + offset.y })),
    arrows: arrows.flatMap((arrow) => {
      const from = newIdByOldId.get(arrow.fromCardId);
      const to = newIdByOldId.get(arrow.toCardId);
      return from && to ? [{ ...arrow, id: ulid(), fromCardId: from, toCardId: to }] : [];
    }),
  };
}
