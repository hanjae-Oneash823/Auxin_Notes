import type { ParsedLink } from './types';

// [[Target Title]] or [[Target Title|alias text]]. The alias portion is
// display-only — resolution always keys off the target between the brackets.
const WIKILINK_PATTERN = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g;

// #tag / #nested/tag. A `#` immediately followed by whitespace is a markdown
// heading marker, not a tag — the pattern requires a word char right after `#`.
const TAG_PATTERN = /(?:^|\s)#([a-zA-Z0-9_][a-zA-Z0-9_/-]*)/g;

export function parseLinks(body: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  for (const match of body.matchAll(WIKILINK_PATTERN)) {
    links.push({ targetRaw: match[1].trim(), position: match.index });
  }
  return links;
}

export function parseInlineTags(body: string): string[] {
  const tags = new Set<string>();
  for (const match of body.matchAll(TAG_PATTERN)) {
    tags.add(match[1]);
  }
  return Array.from(tags);
}

export function countWords(body: string): number {
  const trimmed = body.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
