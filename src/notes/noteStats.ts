export interface NoteStats {
  words: number;
  images: number;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const CODE_FENCE = /```[\s\S]*?```/g;
const IMAGE_MARKDOWN = /!\[[^\]]*\]\([^)]*\)/g;
const IMAGE_WIKILINK = /!\[\[[^\]]*\]\]/g;
const HTML_TAG = /<[^>]+>/g;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const RELATIVE_TIME_DAYS_LIMIT = 30;

/**
 * Approximate length and image count of a note's raw file text. Words are
 * whitespace-separated tokens containing a letter or digit, counted after
 * dropping frontmatter, fenced code, image syntax, and HTML tags — a fair
 * measure for space-delimited scripts (English, Korean), an undercount for
 * Chinese/Japanese. Images inside code fences aren't images, so fences are
 * stripped before counting them.
 */
export function computeNoteStats(raw: string): NoteStats {
  const body = raw.replace(FRONTMATTER, '').replace(CODE_FENCE, ' ');
  const images = (body.match(IMAGE_MARKDOWN)?.length ?? 0) + (body.match(IMAGE_WIKILINK)?.length ?? 0);
  const prose = body.replace(IMAGE_MARKDOWN, ' ').replace(IMAGE_WIKILINK, ' ').replace(HTML_TAG, ' ');
  const words = prose.split(/\s+/).filter((token) => WORD_CHARACTER.test(token)).length;
  return { words, images };
}

/** 842 -> "842", 1234 -> "1.2k", 12000 -> "12k". */
export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  const thousands = Math.round(count / 100) / 10;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
}

/** Compact age of an ISO timestamp: "now", "5m", "3h", "2d", then a date.
 *  Empty string for an unparseable value. `nowMs` is injectable for tests. */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return '';
  const minutes = Math.floor((nowMs - timestamp) / MS_PER_MINUTE);
  if (minutes < 1) return 'now';
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `${hours}h`;
  const days = Math.floor(hours / HOURS_PER_DAY);
  if (days < RELATIVE_TIME_DAYS_LIMIT) return `${days}d`;
  return new Date(timestamp).toLocaleDateString();
}

/** Folder a vault-relative note path lives in, as "A / B" — "Vault" at the root. */
export function formatFolder(relativePath: string): string {
  const parts = relativePath.split('/').slice(0, -1);
  return parts.length === 0 ? 'Vault' : parts.join(' / ');
}
