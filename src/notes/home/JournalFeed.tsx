import { useEffect, useState } from 'react';
import { fetch as httpFetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';

type JournalSource = 'Nature' | 'Cell';

interface JournalEntry {
  id: string;
  title: string;
  link: string;
  date: string;
  source: JournalSource;
}

const FEEDS: ReadonlyArray<{ source: JournalSource; url: string }> = [
  { source: 'Nature', url: 'https://www.nature.com/nature.rss' },
  { source: 'Cell', url: 'https://www.cell.com/cell/current.rss' },
];
const VISIBLE_ENTRIES = 6;
const FETCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;
/** Cell's feed mixes in news and commentary; these sections are the papers. */
const CELL_RESEARCH_SECTIONS = new Set(['Article', 'Short article', 'Resource']);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Journal titles embed raw HTML (e.g. `SrTiO<sub>3</sub>`); show just the text. */
const stripTags = (title: string) => title.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Nature's peer-reviewed DOI series is s41586-*; d41586-* is news/comment. */
function isNatureResearchPaper(link: string, title: string): boolean {
  return /\/articles\/s\d+-/.test(link) && !/^(author|publisher) correction/i.test(title);
}

function textOf(item: Element, tag: string): string {
  return item.getElementsByTagName(tag)[0]?.textContent ?? '';
}

function parseRss(xml: string, source: JournalSource): JournalEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return [];
  return Array.from(doc.getElementsByTagName('item'))
    .map((item) => ({
      id: textOf(item, 'link'),
      title: stripTags(textOf(item, 'title')),
      link: textOf(item, 'link'),
      date: textOf(item, 'dc:date'),
      source,
      section: textOf(item, 'prism:section'),
    }))
    .filter((entry) =>
      source === 'Nature'
        ? isNatureResearchPaper(entry.link, entry.title)
        : CELL_RESEARCH_SECTIONS.has(entry.section),
    )
    .map(({ section: _section, ...entry }) => entry);
}

/** Nature's feed sometimes bounces through a cookie gate that parses to zero
 *  entries; a fresh request usually clears it, so retry before giving up. */
async function fetchJournal(url: string, source: JournalSource): Promise<JournalEntry[]> {
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await httpFetch(url);
      if (res.ok) {
        const entries = parseRss(await res.text(), source);
        if (entries.length > 0) return entries;
      }
    } catch {
      // network error — fall through to retry
    }
    if (attempt < FETCH_ATTEMPTS - 1) await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
  }
  return [];
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Home's research feed: the newest Nature and Cell papers, one line each. */
export function JournalFeed() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(FEEDS.map(({ source, url }) => fetchJournal(url, source))).then((results) => {
      if (cancelled) return;
      const merged = results.flat().sort((a, b) => b.date.localeCompare(a.date));
      setEntries(merged.slice(0, VISIBLE_ENTRIES));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (entries === null) {
    return (
      <span className="text-fg-faint" style={{ fontSize: '0.8rem' }}>
        loading…
      </span>
    );
  }
  if (entries.length === 0) {
    return (
      <span className="text-fg-faint" style={{ fontSize: '0.8rem' }}>
        couldn't reach nature / cell
      </span>
    );
  }

  return (
    <ul className="flex flex-col">
      {entries.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            onClick={() => void openUrl(entry.link)}
            title={entry.title}
            className="flex w-full items-baseline gap-2 rounded-row px-1 py-1 text-left transition-colors duration-panel ease-panel hover:bg-border-subtle"
          >
            <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.72rem' }}>
              {formatDate(entry.date)}
            </span>
            <span className="min-w-0 flex-1 truncate text-fg-muted" style={{ fontSize: '0.82rem' }}>
              {entry.title}
            </span>
            <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.68rem' }}>
              {entry.source}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
