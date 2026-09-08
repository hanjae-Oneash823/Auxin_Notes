import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../db/client';
import { getHubNotes, getHubStats, type HubNoteEntry, type HubStats } from '../db/queries/hub';
import type { NoteSummary } from '../db/queries/notes';
import { parseHubBlock, type HubConfig } from '../vault/parseHubBlock';
import { dirname, titleFromPath } from '../vault/noteTitle';
import { useVaultStore } from '../vault/vaultStore';

const STALE_DAYS = 30;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;
const EXCERPT_LIMIT = 140;

const SORT_OPTIONS: { value: HubConfig['sort']; label: string }[] = [
  { value: 'modified', label: 'modified' },
  { value: 'created', label: 'created' },
  { value: 'title', label: 'title' },
  { value: 'wordCount', label: 'words' },
];

const GROUP_OPTIONS: { value: HubConfig['groupBy']; label: string }[] = [
  { value: 'flat', label: 'flat' },
  { value: 'subfolder', label: 'subfolder' },
  { value: 'tag', label: 'tag' },
];

interface HubViewProps {
  note: NoteSummary;
  vaultRoot: string;
  onNavigate: (path: string) => void;
  onEditSource: () => void;
}

/** `entry.path` relative to the hub's own scope folder — used to derive an
 *  immediate-subfolder group label without a folder table (there isn't one;
 *  folders are purely path-string prefixes everywhere in this codebase). */
function subfolderGroupKey(entryPath: string, scopeFolder: string): string {
  const withinScope = scopeFolder ? entryPath.slice(scopeFolder.length + 1) : entryPath;
  const slashIndex = withinScope.indexOf('/');
  return slashIndex === -1 ? '(this folder)' : withinScope.slice(0, slashIndex);
}

function groupEntries(entries: HubNoteEntry[], groupBy: HubConfig['groupBy'], scopeFolder: string) {
  if (groupBy === 'flat') return new Map([['', entries]]);

  const groups = new Map<string, HubNoteEntry[]>();
  for (const entry of entries) {
    const keys =
      groupBy === 'tag' ? (entry.tags.length > 0 ? entry.tags : ['(untagged)']) : [subfolderGroupKey(entry.path, scopeFolder)];
    for (const key of keys) {
      const bucket = groups.get(key);
      if (bucket) bucket.push(entry);
      else groups.set(key, [entry]);
    }
  }
  return groups;
}

function sortEntries(entries: HubNoteEntry[], sort: HubConfig['sort']): HubNoteEntry[] {
  const sorted = [...entries];
  switch (sort) {
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'wordCount':
      return sorted.sort((a, b) => b.wordCount - a.wordCount);
    case 'created':
      return sorted.sort((a, b) => b.created.localeCompare(a.created));
    case 'modified':
    default:
      return sorted.sort((a, b) => b.modified.localeCompare(a.modified));
  }
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

function isStale(modified: string): boolean {
  const date = new Date(modified);
  return !Number.isNaN(date.getTime()) && Date.now() - date.getTime() > STALE_MS;
}

/**
 * Live, auto-populated view for a "hub" note — a folder/scope dashboard that
 * never needs manual upkeep as notes are added, renamed, or removed. Renders
 * in place of the plain markdown Editor for any note whose body carries a
 * parseable ```hub fenced config block (see parseHubBlock.ts). Grouping/sort
 * are local UI state (not persisted) layered over the note's own defaults,
 * mirroring HomeDashboard's "glanceable, not a full customizable dashboard"
 * posture — just scoped and richer.
 */
export function HubView({ note, vaultRoot, onNavigate, onEditSource }: HubViewProps) {
  const [config, setConfig] = useState<HubConfig | null>(null);
  const [entries, setEntries] = useState<HubNoteEntry[]>([]);
  const [stats, setStats] = useState<HubStats | null>(null);
  const [sort, setSort] = useState<HubConfig['sort']>('modified');
  const [groupBy, setGroupBy] = useState<HubConfig['groupBy']>('flat');
  const syncVersion = useVaultStore((state) => state.syncVersion);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const body = await invoke<string>('read_note', { path: `${vaultRoot}/${note.path}` });
      const parsed = parseHubBlock(body);
      if (cancelled) return;

      const resolved: HubConfig = parsed ?? { recursive: true, sort: 'modified', groupBy: 'flat' };
      const folder = resolved.folder ?? dirname(note.path);
      setConfig(resolved);
      setSort(resolved.sort);
      setGroupBy(resolved.groupBy);

      const db = await getDb(vaultRoot);
      const scope = { folder, recursive: resolved.recursive };
      const [hubEntries, hubStats] = await Promise.all([
        getHubNotes(db, scope, note.path),
        getHubStats(db, scope, note.path),
      ]);
      if (cancelled) return;
      setEntries(hubEntries);
      setStats(hubStats);
    })();

    return () => {
      cancelled = true;
    };
  }, [note.path, vaultRoot, syncVersion]);

  if (!config) return null;

  const folder = config.folder ?? dirname(note.path);
  const grouped = groupEntries(sortEntries(entries, sort), groupBy, folder);

  return (
    <div
      className="mx-auto flex h-full flex-col gap-4 overflow-y-auto"
      style={{ maxWidth: '760px', padding: 'var(--space-content-lg)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-fg-prominent" style={{ fontSize: '2.2em', fontWeight: 700 }}>
          {titleFromPath(note.path)}
        </h1>
        <button
          type="button"
          onClick={onEditSource}
          className="shrink-0 text-fg-faint hover:text-fg-prominent"
          style={{ fontSize: '0.75rem' }}
        >
          [edit source]
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-fg-faint" style={{ fontSize: '0.75rem' }}>
        <span>[{folder || '(vault root)'}{config.recursive ? ', recursive' : ''}]</span>
        {stats && (
          <>
            <span>
              [{stats.noteCount} {stats.noteCount === 1 ? 'note' : 'notes'}]
            </span>
            <span>[{stats.totalWords.toLocaleString()} words]</span>
            {stats.unresolvedLinkCount > 0 && (
              <span className="text-accent-link-broken">
                [{stats.unresolvedLinkCount} unresolved {stats.unresolvedLinkCount === 1 ? 'link' : 'links'}]
              </span>
            )}
            {stats.lastUpdated && <span>[updated {formatDate(stats.lastUpdated)}]</span>}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4" style={{ fontSize: '0.72rem' }}>
        <ToggleGroup label="sort" value={sort} options={SORT_OPTIONS} onChange={setSort} />
        <ToggleGroup label="group" value={groupBy} options={GROUP_OPTIONS} onChange={setGroupBy} />
      </div>

      <div className="flex flex-col gap-4">
        {entries.length === 0 && (
          <span className="px-1 text-fg-faint" style={{ fontSize: '0.82rem' }}>
            no notes in this scope yet
          </span>
        )}
        {Array.from(grouped.entries()).map(([groupLabel, groupItems]) => (
          <div key={groupLabel || '__flat__'} className="flex flex-col gap-1">
            {groupLabel && (
              <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
                [{groupLabel}]
              </span>
            )}
            {groupItems.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onNavigate(entry.path)}
                className="flex flex-col items-start gap-0.5 border-b border-b-border-subtle px-1 py-1.5 text-left hover:bg-accent-link/10"
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="truncate text-accent-link" style={{ fontSize: '0.88rem' }}>
                    {entry.title}
                  </span>
                  <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.7rem' }}>
                    {formatDate(entry.modified)}
                  </span>
                </div>
                {entry.excerpt && (
                  <span className="line-clamp-1 text-fg-muted" style={{ fontSize: '0.78rem' }}>
                    {entry.excerpt.slice(0, EXCERPT_LIMIT)}
                    {entry.excerpt.length > EXCERPT_LIMIT ? '…' : ''}
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-2 text-fg-faint" style={{ fontSize: '0.68rem' }}>
                  {entry.tags.map((tag) => (
                    <span key={tag} className="text-accent-tag">
                      #{tag}
                    </span>
                  ))}
                  <span>
                    {entry.backlinkCount} {entry.backlinkCount === 1 ? 'backlink' : 'backlinks'}
                  </span>
                  <span>{entry.wordCount}w</span>
                  {entry.isOrphan && <span className="text-accent-link-broken">[orphan]</span>}
                  {isStale(entry.modified) && <span>[stale]</span>}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface ToggleGroupProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function ToggleGroup<T extends string>({ label, value, options, onChange }: ToggleGroupProps<T>) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-fg-faint">{label}:</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={
            value === option.value ? 'text-accent-link' : 'text-fg-faint hover:text-fg-prominent'
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
