// In-document PDF search. Matching is per pdf.js text item (one item is
// roughly one line run), so a phrase split across two items is not found —
// ponytail: item-level matching; join items per page if that ever bites.

/** Start offsets of every non-overlapping, case-insensitive hit of `query` in `text`. */
function findAll(text: string, query: string): number[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const haystack = text.toLowerCase();
  const starts: number[] = [];
  for (let from = haystack.indexOf(needle); from !== -1; from = haystack.indexOf(needle, from + needle.length)) {
    starts.push(from);
  }
  return starts;
}

/** Hits per page; `pages[i]` is page i+1's text-item strings. */
export function countPageMatches(pages: string[][], query: string): number[] {
  return pages.map((items) => items.reduce((sum, item) => sum + findAll(item, query).length, 0));
}

/** Maps a global match index (0-based, across all pages) to its 1-based page
 *  and its ordinal among that page's hits; null when out of range. */
export function locateMatch(counts: number[], index: number): { page: number; ordinal: number } | null {
  let remaining = index;
  for (let page = 0; page < counts.length; page++) {
    if (remaining < counts[page]) return { page: page + 1, ordinal: remaining };
    remaining -= counts[page];
  }
  return null;
}

/** Wraps every hit inside the text layer's spans in a `<mark>` (re-running
 *  with a new query first restores the plain text). `currentOrdinal` is the
 *  hit to emphasise; that mark is returned so the caller can scroll to it. */
export function highlightSpans(spans: HTMLElement[], query: string, currentOrdinal: number | null): HTMLElement | null {
  let ordinal = 0;
  let current: HTMLElement | null = null;
  for (const span of spans) {
    const text = span.textContent ?? '';
    const starts = findAll(text, query);
    if (starts.length === 0) {
      if (span.childElementCount > 0) span.replaceChildren(text);
      continue;
    }
    const nodes: Node[] = [];
    let cursor = 0;
    for (const start of starts) {
      if (start > cursor) nodes.push(document.createTextNode(text.slice(cursor, start)));
      const mark = document.createElement('mark');
      mark.className = ordinal === currentOrdinal ? 'pdf-hit pdf-hit-current' : 'pdf-hit';
      mark.textContent = text.slice(start, start + query.length);
      if (ordinal === currentOrdinal) current = mark;
      nodes.push(mark);
      cursor = start + query.length;
      ordinal++;
    }
    if (cursor < text.length) nodes.push(document.createTextNode(text.slice(cursor)));
    span.replaceChildren(...nodes);
  }
  return current;
}
