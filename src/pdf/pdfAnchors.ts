// A PDF anchor is the text `@p12` in a fused note: "this part of the note is
// about page 12". It governs everything after it until the next anchor.
// Deliberately not a wikilink or tag, so the index ignores it. The lookbehind
// keeps `name@p12.com`-style text from counting.

const ANCHOR_SOURCE = '(?<![\\w@])@p(\\d+)(?!\\w)';

/** A fresh global regex each call — a shared one would carry `lastIndex` state. */
export function anchorPattern(): RegExp {
  return new RegExp(ANCHOR_SOURCE, 'g');
}

export function anchorText(page: number): string {
  return `@p${page}`;
}

/** The page of the last anchor that starts at or before `pos`; null when the
 *  cursor is above every anchor (or the note has none). */
export function findAnchorPage(text: string, pos: number): number | null {
  let page: number | null = null;
  for (const match of text.matchAll(anchorPattern())) {
    if ((match.index ?? 0) > pos) break;
    page = Number(match[1]);
  }
  return page;
}
