/**
 * A note's tabs live inside its single .md file, each introduced by a marker
 * line — `<!-- tab: Name -->` — so the file stays plain markdown (the marker is
 * an invisible HTML comment elsewhere) and the vault index, links and tags keep
 * parsing the whole file untouched. Text before the first marker (every note
 * that predates tabs) is the default tab, `DEFAULT_TAB_NAME`, and never carries
 * a marker of its own.
 */
export interface NoteTab {
  name: string;
  text: string;
}

export const DEFAULT_TAB_NAME = 'Main';

const MARKER = /^<!-- tab: (.*) -->$/;

/** Names are embedded in a one-line HTML comment — strip what would end it early or wrap it. */
export function sanitizeTabName(name: string): string {
  return name.replace(/-->|[\r\n]+/g, ' ').trim();
}

export function parseTabs(raw: string): NoteTab[] {
  const tabs: { name: string; lines: string[] }[] = [];
  for (const line of raw.split('\n')) {
    const marker = MARKER.exec(line);
    if (marker) {
      tabs.push({ name: sanitizeTabName(marker[1]) || DEFAULT_TAB_NAME, lines: [] });
      continue;
    }
    if (tabs.length === 0) tabs.push({ name: DEFAULT_TAB_NAME, lines: [] });
    tabs[tabs.length - 1].lines.push(line);
  }
  return tabs.map((tab) => ({ name: tab.name, text: tab.lines.join('\n') }));
}

export function serializeTabs(tabs: readonly NoteTab[]): string {
  return tabs
    .map((tab, index) => {
      // parseTabs reads unmarked leading text as the default tab, so that one needs no marker.
      if (index === 0 && tab.name === DEFAULT_TAB_NAME) return tab.text;
      return `<!-- tab: ${sanitizeTabName(tab.name) || DEFAULT_TAB_NAME} -->\n${tab.text}`;
    })
    .join('\n');
}
