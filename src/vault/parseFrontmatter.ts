export interface LegacyFrontmatter {
  id?: string;
  created?: string;
}

export interface LegacyFrontmatterResult {
  legacy: LegacyFrontmatter;
  body: string;
  /** A `---` block was present (regardless of whether id/created were
   *  recoverable from it) — the caller uses this to decide whether the
   *  block needs stripping from disk. */
  found: boolean;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * One-shot migration helper: every note written before frontmatter was
 * dropped carries a `---\nid: ...\ncreated: ...\n...\n---` block. This
 * extracts just `id`/`created` (the two fields identity resolution needs to
 * preserve) from that legacy block and returns the body with it stripped.
 * Not a general YAML parser — deliberately narrow to this one job, kept
 * indefinitely since a `raw.startsWith('---')` check stays ~free once every
 * note in a vault has migrated.
 */
export function extractLegacyFrontmatter(raw: string): LegacyFrontmatterResult {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { legacy: {}, body: raw, found: false };
  }

  const [, block, body] = match;
  const legacy: LegacyFrontmatter = {};

  for (const line of block.split(/\r?\n/)) {
    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!keyMatch) continue;

    const [, key, rawValue] = keyMatch;
    if (key === 'id' || key === 'created') {
      legacy[key] = stripQuotes(rawValue.trim());
    }
  }

  return { legacy, body, found: true };
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
