import type { CanvasCard } from '../vault/canvasTypes';

/** Everything on a card a search should be able to hit, lower-cased. */
export function cardSearchText(card: CanvasCard): string {
  const { content } = card;
  switch (content.type) {
    case 'inline':
      return `${content.title ?? ''}\n${content.body}`.toLowerCase();
    case 'title':
    case 'sticky':
    case 'warning':
      return content.text.toLowerCase();
    case 'ghost':
      return content.title.toLowerCase();
    case 'note':
    case 'pdf':
    case 'canvas':
      return content.path.toLowerCase();
    case 'image':
      return `${content.caption ?? ''}\n${content.path}`.toLowerCase();
  }
}

/** The lower-cased words of a search query. */
export function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Character ranges of `text` covered by any of `words` (case-insensitive,
 *  non-overlapping, in order). */
export function findWordRanges(text: string, words: readonly string[]): { from: number; to: number }[] {
  if (words.length === 0) return [];
  // Longest first, so "note" wins over "no" where both start at the same spot.
  const pattern = [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return [...text.matchAll(new RegExp(pattern, 'gi'))].map((m) => ({ from: m.index, to: m.index + m[0].length }));
}

/** `text` cut into pieces, each flagged as a search hit or not. */
export function splitByWords(text: string, words: readonly string[]): { text: string; isHit: boolean }[] {
  const pieces: { text: string; isHit: boolean }[] = [];
  let at = 0;
  for (const { from, to } of findWordRanges(text, words)) {
    if (from > at) pieces.push({ text: text.slice(at, from), isHit: false });
    pieces.push({ text: text.slice(from, to), isHit: true });
    at = to;
  }
  if (at < text.length) pieces.push({ text: text.slice(at), isHit: false });
  return pieces;
}

/** Cards matching `query` (all words, any order, case-insensitive), in board order.
 *  An empty query matches nothing: search is off. */
export function findMatchingCards(cards: readonly CanvasCard[], query: string): CanvasCard[] {
  const words = searchWords(query);
  if (words.length === 0) return [];
  return cards.filter((card) => {
    const text = cardSearchText(card);
    return words.every((word) => text.includes(word));
  });
}
