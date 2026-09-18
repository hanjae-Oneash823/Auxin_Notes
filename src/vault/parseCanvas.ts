import type { CanvasArrow, CanvasCard, CanvasDocument, CanvasGroup } from './canvasTypes';
import { titleFromPath } from './noteTitle';
import { parseLinks } from './parseLinksAndTags';
import type { ParsedLink } from './types';

const CURRENT_VERSION = 1;

/**
 * Parses a `.axcanvas` file's raw JSON text into a typed `CanvasDocument`.
 * Throws on invalid JSON, an unrecognized `version`, or a top-level shape
 * that doesn't match — the caller (syncEngine.ts) treats that as "skip this
 * file's sync," the same "one malformed file can't break the whole vault"
 * guarantee `parseNote` gives markdown notes. Non-destructive: never
 * rewrites the file, only reads it.
 */
export function parseCanvasDocument(raw: string): CanvasDocument {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid canvas JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof json !== 'object' || json === null) {
    throw new Error('canvas file is not a JSON object');
  }
  const { version, cards, groups, arrows } = json as Record<string, unknown>;

  if (version !== CURRENT_VERSION) {
    throw new Error(`unsupported canvas version: ${JSON.stringify(version)}`);
  }
  if (!Array.isArray(cards) || !Array.isArray(arrows)) {
    throw new Error('canvas file is missing its cards/arrows arrays');
  }

  return {
    version: CURRENT_VERSION,
    cards: cards as CanvasCard[],
    groups: (Array.isArray(groups) ? groups : []) as CanvasGroup[],
    arrows: arrows as CanvasArrow[],
  };
}

/**
 * Turns a canvas document into the same `ParsedLink[]` shape a markdown
 * note's body produces (see `parseLinksAndTags.ts`'s `parseLinks`) — so
 * canvas-sourced links land in the `links` table exactly like `[[wikilinks]]`
 * do, with zero changes needed to backlinks/graph/unresolved-links queries.
 *
 * Two sources, both real wikilink-shaped references:
 * 1. An inline (unpromoted) card's own body text — any `[[wikilink]]` a user
 *    typed into the card, parsed the same way a note body is.
 * 2. An arrow whose target resolves to a note title — a promoted card's
 *    title, or a ghost card's title (an unresolved link, same as a broken
 *    `[[wikilink]]` in a note today). An arrow pointing at an inline
 *    (unpromoted, non-ghost) card has no note identity yet, so it produces
 *    no link — it's purely visual until that card is promoted.
 *
 * `position` is repurposed for canvas-sourced rows: an index into `cards[]`
 * for an inline card's wikilink, or into `arrows[]` for an arrow-derived
 * link — not a markdown char offset (see the `links.position` schema
 * comment in `0001_init.sql`, which nothing in the app currently reads).
 */
export function canvasLinks(doc: CanvasDocument): ParsedLink[] {
  const links: ParsedLink[] = [];

  doc.cards.forEach((card, cardIndex) => {
    if (card.content.type !== 'inline') return;
    for (const link of parseLinks(card.content.body)) {
      links.push({ targetRaw: link.targetRaw, position: cardIndex });
    }
  });

  doc.arrows.forEach((arrow, arrowIndex) => {
    const targetRaw = resolveArrowTargetTitle(doc, arrow);
    if (targetRaw === null) return;
    links.push({ targetRaw, position: arrowIndex });
  });

  return links;
}

function resolveArrowTargetTitle(doc: CanvasDocument, arrow: CanvasArrow): string | null {
  const card = doc.cards.find((c) => c.id === arrow.toCardId);
  if (!card) return null;
  if (card.content.type === 'note') return titleFromPath(card.content.path);
  if (card.content.type === 'ghost') return card.content.title;
  return null;
}

/** Concatenated inline-card body text, in card order, for `notes_fts`
 *  indexing — excludes promoted-note and ghost cards, since a promoted
 *  note's own body is already indexed under its own `notes` row and a ghost
 *  has no body of its own. */
export function canvasSearchableBody(doc: CanvasDocument): string {
  return doc.cards
    .filter((card): card is CanvasCard & { content: { type: 'inline'; body: string } } => card.content.type === 'inline')
    .map((card) => card.content.body)
    .join('\n\n');
}
