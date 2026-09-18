import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { CanvasCard } from '../vault/canvasTypes';
import { pickNearestCard, type NavDirection } from './canvasGeometry';

interface UseCanvasKeyboardNavOptions {
  /** Only listens while the canvas tab is actually the visible/active view
   *  — a background tab must not steal arrow-key/typing events. */
  enabled: boolean;
  /** The board's own viewport element — a keydown only drives board
   *  navigation when focus is actually inside it (or nowhere in particular,
   *  i.e. document.body). Without this, clicking a plain, non-text-input
   *  element elsewhere in the app (a sidebar button, a FolderTree row —
   *  `isEditingText()` below only catches text inputs) while a canvas
   *  happens to be the active tab would still route arrow keys/typing into
   *  the board instead of wherever the user actually clicked. */
  containerRef: RefObject<HTMLElement | null>;
  cards: readonly CanvasCard[];
  focusedCardId: string | null;
  onFocusCard: (cardId: string | null) => void;
  onDeleteCard: (cardId: string) => void;
  /** Tab held + an arrow key: create a new card offset from the focused one
   *  in that direction, connected by an arrow back to it. */
  onCreateConnectedCard: (fromCardId: string, direction: NavDirection) => void;
  /** A printable character typed with nothing focused/being edited: start a
   *  brand-new card (near the board's current view) with that character as
   *  its first content. */
  onStartTyping: (initialChar: string) => void;
}

const KEY_TO_DIRECTION: Record<string, NavDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function isEditingText(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return active.closest('.cm-editor') !== null || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA';
}

/**
 * Arrow-key / Tab+direction / type-to-start navigation for the canvas board
 * — a 2D generalization of the file-searcher's "manual focus index, not DOM
 * focus" model (`src/fileSearcher/FileSearcherOverlay.tsx`'s single
 * `window` `keydown` listener owning a `focusedIndex`, no per-row
 * `tabIndex`). Inert whenever a card's own mini-editor (a real CodeMirror
 * instance) has focus — that element handles its own arrow keys and typing
 * as ordinary text editing; this hook only re-engages once focus is back on
 * the board itself (e.g. after clicking a card's header, not its body).
 */
export function useCanvasKeyboardNav({
  enabled,
  containerRef,
  cards,
  focusedCardId,
  onFocusCard,
  onDeleteCard,
  onCreateConnectedCard,
  onStartTyping,
}: UseCanvasKeyboardNavOptions) {
  // Tab has no directional meaning by itself — "Tab plus a direction" is a
  // chord, so this tracks whether Tab is currently held down between its
  // own keydown/keyup, checked when an arrow key fires.
  const tabHeldRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    function isWithinBoard(): boolean {
      const active = document.activeElement;
      if (active === null || active === document.body) return true;
      return containerRef.current?.contains(active) ?? false;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isWithinBoard() || isEditingText()) return;

      if (event.key === 'Tab') {
        // Prevented unconditionally (not just when a card is focused) so
        // Tab never leaks through to the browser's own focus-order — this
        // board doesn't use native tab order at all.
        event.preventDefault();
        tabHeldRef.current = true;
        return;
      }

      const direction = KEY_TO_DIRECTION[event.key];
      if (direction) {
        event.preventDefault();
        if (tabHeldRef.current && focusedCardId) {
          onCreateConnectedCard(focusedCardId, direction);
          return;
        }
        if (!focusedCardId) {
          if (cards.length > 0) onFocusCard(cards[0].id);
          return;
        }
        const nextId = pickNearestCard(cards, focusedCardId, direction);
        if (nextId) onFocusCard(nextId);
        return;
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && focusedCardId) {
        event.preventDefault();
        onDeleteCard(focusedCardId);
        return;
      }

      if (event.key === 'Escape' && focusedCardId) {
        onFocusCard(null);
        return;
      }

      // A single printable character with no modifier held: start a new
      // card. `event.key.length === 1` excludes every named key (Enter,
      // Shift, ArrowUp, ...) without an explicit denylist.
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        onStartTyping(event.key);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === 'Tab') tabHeldRef.current = false;
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, containerRef, cards, focusedCardId, onFocusCard, onDeleteCard, onCreateConnectedCard, onStartTyping]);
}
