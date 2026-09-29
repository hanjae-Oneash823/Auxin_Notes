/** The one place this extension is spelled out on the TypeScript side —
 *  `syncEngine.ts`, `renameEngine.ts`, and `App.tsx`'s `createCanvas` all
 *  import this rather than repeating the literal. The Rust side has its own
 *  copy in `vault_files.rs` (cross-referenced there) since it can't share
 *  this module. */
export const CANVAS_EXTENSION = '.axcanvas';

/** A `.axcanvas` file's parsed shape — a spatial board of cards connected by
 *  arrows. Shared between the parser (`parseCanvas.ts`, which turns this into
 *  index rows the same way a note body's `[[wikilinks]]` become `links` rows)
 *  and the canvas UI (`src/canvas/`), so both sides agree on one schema. */
export interface CanvasDocument {
  version: 1;
  cards: CanvasCard[];
  groups: CanvasGroup[];
  arrows: CanvasArrow[];
  /** `#rrggbb`; absent means the default arrow color. */
  arrowColor?: string;
}

export type CanvasCardContent =
  | { type: 'inline'; body: string }
  | { type: 'note'; path: string }
  | { type: 'ghost'; title: string }
  | { type: 'title'; text: string }
  /** Yellow, italic callout. */
  | { type: 'sticky'; text: string }
  /** Red, bold callout. */
  | { type: 'warning'; text: string }
  /** Link to a `.pdf`; `path` is vault-relative. */
  | { type: 'pdf'; path: string }
  /** `path` is vault-relative (`attachments/…`), like a markdown image link. */
  | { type: 'image'; path: string; /** Display width in world px; default `IMAGE_CARD_WIDTH`. */ width?: number; caption?: string };

export interface CanvasCard {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  content: CanvasCardContent;
}

export interface CanvasArrow {
  id: string;
  fromCardId: string;
  /** Always a card id — a dangling/unresolved target lives on the *card*
   *  (a deduped `content.type: 'ghost'` card, one per not-yet-created
   *  title), not as a separate shape here. Every arrow pointing at the
   *  same not-yet-created title shares that one ghost card, so promoting it
   *  resolves every arrow that targets it at once. */
  toCardId: string;
  label?: string;
}

export interface CanvasGroup {
  id: string;
  label: string;
  cardIds: string[];
}

export function emptyCanvasDocument(): CanvasDocument {
  return { version: 1, cards: [], groups: [], arrows: [] };
}
