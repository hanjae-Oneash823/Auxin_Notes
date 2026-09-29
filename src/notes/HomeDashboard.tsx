import { fillGreeting, randomGreeting } from './home/greetings';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../db/client';
import { formatCount } from './noteStats';
import {
  getRecentNotesRich,
  getVaultStats,
  type RecentNoteEntry,
  type VaultStats,
} from '../db/queries/dashboard';
import { listNotes } from '../db/queries/notes';
import { listTagsWithCounts, type TagCount } from '../db/queries/tags';
import { useStickyStore } from '../sticky/stickyStore';
import { useVaultStore } from '../vault/vaultStore';
import { useSettingsStore } from '../app/settings/settingsStore';
import { flyCardToTab } from '../layout/flyToTab';
import { workspaceTint } from '../layout/workspaces';
import { usePanelLayoutStore } from '../layout/panelLayoutStore';
import { useSmoothWheelScroll } from '../layout/useSmoothWheelScroll';
import { toRelativePath } from '../vault/syncEngine';
import { buildFolderTree, type FolderNode } from '../vault/folderTree';
import { FolderBubbleCluster } from './FolderBubbleCluster';
import { ContinueCard } from './home/ContinueCard';
import { PinnedPapers } from './home/PinnedPapers';
import { listPdfSummaries } from '../pdf/pdfEngine';
import { notePathForPdf } from '../pdf/pdfFiles';
import { RecentGrid } from './home/RecentGrid';
import { SectionLabel } from './home/SectionLabel';
import { TagCloud } from './home/TagCloud';

/** Two lead notes (ContinueCards, side by side), then two 2-column grids: four
 *  more recent notes/canvases and four recent PDFs. */
const LEAD_NOTES_COUNT = 2;
const RECENT_NOTES_COUNT = 4;
const RECENT_PDFS_COUNT = 4;
/** Notes fetched before dropping the ones fused to a PDF (those are reached
 *  through the PDF), so enough remain to fill the grid. */
const RECENT_NOTES_FETCH_LIMIT = 40;
const TOP_TAGS_LIMIT = 16;
const PINNED_PREVIEW_LIMIT = 4;
/** Rough words-per-page used only for the "≈ N pages" fun stat — matches
 *  the commonly cited ~250-300 words/page for double-spaced manuscript
 *  text; not meant to be precise. */
const WORDS_PER_PAGE = 275;

interface HomeDashboardProps {
  vaultRoot: string;
  noteCount: number;
  unresolvedCount: number;
  onSelect: (path: string) => void;
  onSelectTag: (tag: string) => void;
  onNewNote: () => void;
  onNewCanvas: () => void;
  onImportPdf: () => void;
  /** Opens the sticky board — the pinned-notes preview's only action, since
   *  a sticky note has no vault path for `onSelect` to open. */
  onOpenStickyBoard: () => void;
  workspaceNames: string[];
  currentWorkspace: string;
  workspaceColors: Record<string, string | null>;
  onSwitchWorkspace: (name: string) => void;
}

interface DashboardCardProps {
  children: ReactNode;
}

/** Bare wrapper for the header block's analytics and bubble map — the chart
 *  itself is the only ink, with no panel around it. (The sections below the
 *  header are the components in ./home, not boxed cards.) */
function DashboardCard({ children }: DashboardCardProps) {
  return <section className="flex flex-col gap-2">{children}</section>;
}

interface FactTileProps {
  value: string;
  label: string;
  caption?: ReactNode;
}

/** One cell of the "Fun facts" stat grid — a bold headline value (a number
 *  or a short phrase, e.g. "Night owl") over a sentence-case label, with an
 *  optional smaller caption underneath (a date, a note title). Hover just
 *  tints the tile's own background to signal it's a discrete unit, not a
 *  clickable action. */
function FactTile({ value, label, caption }: FactTileProps) {
  return (
    <div className="flex flex-col gap-0.5 rounded-panel p-2 transition-colors duration-panel ease-panel hover:bg-bg-dashboard-card">
      <span className="text-fg-prominent" style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.15 }}>
        {value}
      </span>
      <span className="text-fg-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>
        {label}
      </span>
      {caption && (
        <span className="line-clamp-1 text-fg-faint" style={{ fontSize: '0.76rem' }}>
          {caption}
        </span>
      )}
    </div>
  );
}

interface HeaderActionProps {
  label: string;
  onClick: () => void;
  /** Tints the label with the PDF red. */
  isRed?: boolean;
}

/** The creators under the welcome header — plain bracketed text, matching the
 *  dashboard's other `[...]` labels (note count, "back to hub view"). */
function HeaderAction({ label, onClick, isRed = false }: HeaderActionProps) {
  const tone = isRed
    ? 'text-accent-link-broken hover:brightness-125'
    : 'text-fg-faint hover:text-fg-prominent';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`transition-colors duration-panel ease-panel ${tone}`}
      style={{ fontSize: '0.8rem' }}
    >
      [{label}]
    </button>
  );
}

/**
 * The HOME tab's content — a card-grid dashboard: a welcome header with the
 * two note creators beside it, a vault-wide tag strip, and pinned sticky
 * notes plus recent and most-linked notes in one card. Distinct from
 * HubView, which is the same idea scoped to one folder via a note's own
 * ```hub config block — this one is always vault-wide and never scoped.
 */
export function HomeDashboard({
  vaultRoot,
  noteCount,
  unresolvedCount,
  onSelect,
  onSelectTag,
  onNewNote,
  onNewCanvas,
  onImportPdf,
  onOpenStickyBoard,
  workspaceNames,
  currentWorkspace,
  workspaceColors,
  onSwitchWorkspace,
}: HomeDashboardProps) {
  // Re-rolled each time the dashboard mounts, i.e. every time Home is shown anew.
  const [greeting] = useState(randomGreeting);
  const [recent, setRecent] = useState<RecentNoteEntry[]>([]);
  const [recentPdfs, setRecentPdfs] = useState<RecentNoteEntry[]>([]);
  const [topTags, setTopTags] = useState<TagCount[]>([]);
  const [folderTree, setFolderTree] = useState<FolderNode | null>(null);
  const [vaultStats, setVaultStats] = useState<VaultStats | null>(null);
  const stickyNotes = useStickyStore((state) => state.notes);
  const syncVersion = useVaultStore((state) => state.syncVersion);
  const userName = useSettingsStore((state) => state.userName);
  // Extra side margin grows as sidepanes close: 0 / 1 / 2 closed → +0 / +24 / +48px.
  const closedPaneCount = usePanelLayoutStore(
    (state) => Number(!state.isLeftSidebarOpen) + Number(!state.isRightSidebarOpen),
  );
  const sideExtra = `${closedPaneCount * 24}px`;
  const scrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(scrollRef);

  /** Opens a note and flies the clicked card/bubble into its sidebar tab —
   *  the animation must start first, while `source` still exists. */
  function openNote(path: string, source: Element) {
    flyCardToTab(source, `${vaultRoot}/${path}`);
    onSelect(path);
  }

  const pinnedNotes = stickyNotes
    .filter((note) => note.pinned)
    .sort((a, b) => (a.pinnedOrder ?? 0) - (b.pinnedOrder ?? 0))
    .slice(0, PINNED_PREVIEW_LIMIT);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const db = await getDb(vaultRoot);
      const [recentRows, pdfs, tagRows, allNotes, folderAbsolutePaths, stats] = await Promise.all([
        getRecentNotesRich(db, RECENT_NOTES_FETCH_LIMIT),
        listPdfSummaries(vaultRoot),
        listTagsWithCounts(db),
        listNotes(db),
        invoke<string[]>('list_vault_folders', { root: vaultRoot }),
        getVaultStats(db),
      ]);
      if (cancelled) return;
      const fusedNotePaths = new Set(pdfs.map((pdf) => notePathForPdf(pdf.path)));
      setRecent(recentRows.filter((note) => !fusedNotePaths.has(note.path)).slice(0, LEAD_NOTES_COUNT + RECENT_NOTES_COUNT));
      setRecentPdfs(
        [...pdfs]
          .sort((a, b) => b.modified.localeCompare(a.modified))
          .slice(0, RECENT_PDFS_COUNT)
          .map((pdf) => ({ id: pdf.id, path: pdf.path, title: pdf.title, modified: pdf.modified, tags: [], excerpt: '', isHub: false, isCanvas: false, isPdf: true, sizeBytes: pdf.sizeBytes })),
      );
      setTopTags([...tagRows].sort((a, b) => b.count - a.count).slice(0, TOP_TAGS_LIMIT));
      const folderPaths = folderAbsolutePaths.map((path) => toRelativePath(vaultRoot, path));
      setFolderTree(buildFolderTree(allNotes, folderPaths));
      setVaultStats(stats);
    })();

    return () => {
      cancelled = true;
    };
  }, [vaultRoot, syncVersion]);

  return (
    <div
      ref={scrollRef}
      className="no-scrollbar mx-auto flex h-full flex-col gap-4 overflow-y-auto"
      style={{
        maxWidth: 'var(--width-dashboard-max)',
        transition: 'var(--transition-content-width)',
        padding: 'var(--space-content-lg)',
        paddingTop: 'calc(var(--space-content-lg) + 1rem)',
        paddingLeft: `calc(var(--space-content-lg) + ${sideExtra})`,
        paddingRight: `calc(var(--space-content-lg) + ${sideExtra})`,
      }}
    >
      <div className="mb-12 flex gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {workspaceNames.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {workspaceNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSwitchWorkspace(name)}
                  className={`rounded-row border px-2 py-0.5 transition-colors duration-panel ease-panel hover:border-border hover:bg-border-subtle hover:text-fg-prominent ${
                    name === currentWorkspace
                      ? 'border-border bg-border-subtle text-fg-prominent'
                      : 'border-border-subtle text-fg-muted'
                  }`}
                  style={{
                    fontSize: '0.7rem',
                    background: workspaceTint(workspaceColors[name], name === currentWorkspace ? 45 : 28),
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {userName && (
            <h1 className="text-fg-prominent" style={{ fontSize: '2.4em', fontWeight: 700 }}>
              {fillGreeting(greeting, userName)}
            </h1>
          )}
          <div className="flex gap-4 text-fg-faint" style={{ fontSize: '0.75rem' }}>
            <span>
              [{noteCount} {noteCount === 1 ? 'note' : 'notes'}]
            </span>
            {unresolvedCount > 0 && (
              <span className="text-accent-link-broken">
                [{unresolvedCount} unresolved {unresolvedCount === 1 ? 'link' : 'links'}]
              </span>
            )}
          </div>

          <div className="-mt-3.5 flex gap-3">
            <HeaderAction label="New note" onClick={onNewNote} />
            <HeaderAction label="New canvas" onClick={onNewCanvas} />
            <HeaderAction label="Import PDF" onClick={onImportPdf} isRed />
          </div>

          {vaultStats && (
            <DashboardCard>
              <div className="grid grid-cols-[max-content_max-content_max-content] gap-x-10 gap-y-3">
                <FactTile
                  value={formatCount(vaultStats.totalWords)}
                  label="Words written"
                  caption={`≈ ${Math.round(vaultStats.totalWords / WORDS_PER_PAGE).toLocaleString()} pages`}
                />
                {vaultStats.longestNote && (
                  <FactTile
                    value={formatCount(vaultStats.longestNote.wordCount)}
                    label="Longest note"
                    caption={<span className="text-accent-link">{vaultStats.longestNote.title}</span>}
                  />
                )}
                <FactTile value={formatCount(vaultStats.totalLinkCount)} label="Total links" />
              </div>
            </DashboardCard>
          )}
        </div>

        <div className="flex w-2/5 min-w-0 shrink-0 flex-col justify-center">
          <DashboardCard>
            {folderTree && <FolderBubbleCluster key={vaultRoot} root={folderTree} onSelectNote={openNote} />}
          </DashboardCard>
        </div>
      </div>

      {recent.length === 0 ? (
        <span className="px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
          no notes yet
        </span>
      ) : (
        <section className="mb-4 flex flex-col gap-3">
          <SectionLabel label="Continue writing" />
          <div className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2">
            {recent.slice(0, LEAD_NOTES_COUNT).map((note) => (
              <ContinueCard key={note.path} note={note} onSelect={openNote} />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 pb-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {(recent.length > LEAD_NOTES_COUNT || recentPdfs.length > 0) && (
          <div className="flex min-w-0 flex-col gap-8">
            {recent.length > LEAD_NOTES_COUNT && (
              <section className="flex min-w-0 flex-col gap-3">
                <SectionLabel label="Recent" meta={`${recent.length - LEAD_NOTES_COUNT}`} />
                <RecentGrid notes={recent.slice(LEAD_NOTES_COUNT)} onSelect={openNote} />
              </section>
            )}
            {recentPdfs.length > 0 && (
              <section className="flex min-w-0 flex-col gap-3">
                <SectionLabel label="Recent PDFs" meta={`${recentPdfs.length}`} />
                <RecentGrid notes={recentPdfs} onSelect={openNote} />
              </section>
            )}
          </div>
        )}

        <aside className="flex min-w-0 flex-col gap-8 lg:col-start-2 lg:row-start-1">
          {pinnedNotes.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionLabel label="Pinned" />
              <PinnedPapers notes={pinnedNotes} onOpen={onOpenStickyBoard} />
            </section>
          )}

          {topTags.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionLabel label="Tags" />
              <TagCloud tags={topTags} onSelect={onSelectTag} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
