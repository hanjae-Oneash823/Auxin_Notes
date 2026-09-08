export interface HubConfig {
  /** Vault-relative folder path to scope this hub to. Undefined means
   *  "default to this hub note's own containing folder" — the caller (not
   *  this parser, which only sees a note's body text) resolves that default
   *  using the note's own path. */
  folder?: string;
  recursive: boolean;
  sort: 'modified' | 'created' | 'title' | 'wordCount';
  groupBy: 'flat' | 'subfolder' | 'tag';
}

const DEFAULTS: Omit<HubConfig, 'folder'> = { recursive: true, sort: 'modified', groupBy: 'flat' };

// ```hub\nkey: value\n...\n``` — fenced like a code block, deliberately never
// YAML frontmatter (see parseFrontmatter.ts's doc comment: this app dropped
// frontmatter on purpose). Must start at the beginning of a line; the block
// can appear anywhere in the body, not just the top, so a hub note can still
// carry freeform prose around it.
const HUB_BLOCK_PATTERN = /^```hub\r?\n([\s\S]*?)\r?\n```\r?$/m;

const SORT_VALUES: readonly HubConfig['sort'][] = ['modified', 'created', 'title', 'wordCount'];
const GROUP_BY_VALUES: readonly HubConfig['groupBy'][] = ['flat', 'subfolder', 'tag'];

function isSort(value: string): value is HubConfig['sort'] {
  return (SORT_VALUES as readonly string[]).includes(value);
}

function isGroupBy(value: string): value is HubConfig['groupBy'] {
  return (GROUP_BY_VALUES as readonly string[]).includes(value);
}

/**
 * Parses a note body's fenced ```hub config block, if any. Non-destructive —
 * unlike extractLegacyFrontmatter, this never strips anything from the body:
 * the block is part of the note's durable, on-disk, git-diffable content, not
 * a one-time migration artifact.
 */
export function parseHubBlock(body: string): HubConfig | null {
  const match = body.match(HUB_BLOCK_PATTERN);
  if (!match) return null;

  const config: HubConfig = { ...DEFAULTS };
  for (const line of match[1].split(/\r?\n/)) {
    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!keyMatch) continue;

    const [, key, rawValue] = keyMatch;
    const value = rawValue.trim();
    if (key === 'folder') config.folder = value;
    else if (key === 'recursive') config.recursive = value === 'true';
    else if (key === 'sort' && isSort(value)) config.sort = value;
    else if (key === 'groupBy' && isGroupBy(value)) config.groupBy = value;
  }
  return config;
}
