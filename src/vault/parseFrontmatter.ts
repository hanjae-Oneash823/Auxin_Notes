import type { NoteFrontmatter } from './types';

export interface FrontmatterParseResult {
  frontmatter: Partial<NoteFrontmatter>;
  body: string;
  /** A `---` frontmatter block was present but couldn't be parsed cleanly. */
  malformed: boolean;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Hand-rolled parser for Auxin's narrow, well-known frontmatter shape
 * (id/created/modified/tags) — deliberately not a full YAML parser. Never
 * throws: malformed input degrades to `malformed: true` with whatever fields
 * were recoverable, so one bad file can't halt reconciliation.
 */
export function parseFrontmatter(raw: string): FrontmatterParseResult {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { frontmatter: {}, body: raw, malformed: false };
  }

  const [, block, body] = match;
  const frontmatter: Partial<NoteFrontmatter> = {};
  let malformed = false;

  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!keyMatch) continue;

    const [, key, rawValue] = keyMatch;
    try {
      if (key === 'id' || key === 'created' || key === 'modified') {
        frontmatter[key] = stripQuotes(rawValue.trim());
      } else if (key === 'tags') {
        const { tags, consumedLines } = parseTags(rawValue, lines, i + 1);
        frontmatter.tags = tags;
        i += consumedLines;
      }
    } catch {
      malformed = true;
    }
  }

  return { frontmatter, body, malformed };
}

function parseTags(
  inlineValue: string,
  lines: string[],
  startIndex: number,
): { tags: string[]; consumedLines: number } {
  const trimmed = inlineValue.trim();

  // Flow syntax: tags: [research, thesis/chapter1]
  if (trimmed.startsWith('[')) {
    const inner = trimmed.replace(/^\[/, '').replace(/\]$/, '');
    const tags = inner
      .split(',')
      .map((tag) => stripQuotes(tag.trim()))
      .filter(Boolean);
    return { tags, consumedLines: 0 };
  }

  // Block list syntax:
  // tags:
  //   - research
  //   - thesis/chapter1
  if (trimmed === '') {
    const tags: string[] = [];
    let consumed = 0;
    for (let i = startIndex; i < lines.length; i++) {
      const itemMatch = lines[i].match(/^\s*-\s*(.+)$/);
      if (!itemMatch) break;
      tags.push(stripQuotes(itemMatch[1].trim()));
      consumed++;
    }
    return { tags, consumedLines: consumed };
  }

  return { tags: [], consumedLines: 0 };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
