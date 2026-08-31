import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { Editor } from './editor/Editor';
import { VaultPicker } from './app/firstRun/VaultPicker';
import { getDb } from './db/client';
import { listNotes, type NoteSummary } from './db/queries/notes';
import { getUnresolvedLinkGroups } from './db/queries/links';
import { syncFile, toRelativePath } from './vault/syncEngine';
import { renameNote } from './vault/renameEngine';
import { useVaultStore } from './vault/vaultStore';
import { useSettingsStore } from './app/settings/settingsStore';
import { AppShell } from './layout/AppShell';
import { Sidebar } from './layout/Sidebar';
import { StatusBar } from './layout/StatusBar';
import { TabBar, type TabItem } from './layout/TabBar';
import { TitleBar } from './layout/TitleBar';
import { titleFromPath } from './vault/noteTitle';
import { NoteList } from './notes/NoteList';
import { TagBrowser } from './notes/TagBrowser';
import { BacklinksPanel } from './notes/BacklinksPanel';
import { UnresolvedLinksPanel } from './notes/UnresolvedLinksPanel';
import { SearchPanel } from './search/SearchPanel';
import { GraphPanel } from './graph/GraphPanel';

const HOME_TAB_ID = 'home';

async function fetchNotes(vaultRoot: string, tag: string | null): Promise<NoteSummary[]> {
  const db = await getDb(vaultRoot);
  return listNotes(db, tag ? { tag } : {});
}

async function fetchUnresolvedCount(vaultRoot: string): Promise<number> {
  const db = await getDb(vaultRoot);
  return (await getUnresolvedLinkGroups(db)).length;
}

interface VaultReadyProps {
  vaultRoot: string;
  activeTabId: string;
  tabItems: TabItem[];
  setActiveTabId: (id: string) => void;
  openAbsolutePath: (absolutePath: string) => void;
  closeTab: (id: string) => void;
  renameTabId: (oldId: string, newId: string) => void;
}

function VaultReady({
  vaultRoot,
  activeTabId,
  tabItems,
  setActiveTabId,
  openAbsolutePath,
  closeTab,
  renameTabId,
}: VaultReadyProps) {
  // allNotes is unfiltered — needed so the active note can still be found
  // by id (for BacklinksPanel) even when a tag filter hides it from the
  // displayed `notes` list.
  const [allNotes, setAllNotes] = useState<NoteSummary[] | null>(null);
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const activePath = activeTabId === HOME_TAB_ID ? null : activeTabId;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameStatus, setRenameStatus] = useState<{ message: string; isError: boolean } | null>(null);
  // Resets to writing mode on every app launch — not persisted, deliberately.
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [isGraphMode, setIsGraphMode] = useState(false);

  async function refreshNotes() {
    const [all, unresolved] = await Promise.all([
      fetchNotes(vaultRoot, null),
      fetchUnresolvedCount(vaultRoot),
    ]);
    setAllNotes(all);
    setNotes(selectedTag ? await fetchNotes(vaultRoot, selectedTag) : all);
    setUnresolvedCount(unresolved);
  }

  const syncVersion = useVaultStore((state) => state.syncVersion);

  useEffect(() => {
    void refreshNotes();
  }, [vaultRoot, selectedTag, syncVersion]);

  function openRelativePath(relativePath: string) {
    openAbsolutePath(`${vaultRoot}/${relativePath}`);
  }

  async function createNote() {
    const title = `Untitled ${Date.now()}`;
    const absolutePath = `${vaultRoot}/${title}.md`;
    await invoke('write_note', { path: absolutePath, content: '' });
    await syncFile(vaultRoot, absolutePath);
    await refreshNotes();
    openAbsolutePath(absolutePath);
    // A freshly created note is opened to be written into — reading mode
    // would make it immediately non-editable with no obvious way to start.
    setIsReadingMode(false);
  }

  function startRename(note: NoteSummary) {
    setRenamingId(note.id);
    setRenameValue(note.title);
    setRenameStatus(null);
  }

  /** Shared by the sidebar's inline rename and the editor's title field —
   *  both ultimately do the same rename against the same note. */
  async function performRename(note: NoteSummary, newTitle: string) {
    const title = newTitle.trim();
    if (!title || title === note.title) return;

    try {
      const result = await renameNote(vaultRoot, note.id, title);
      const message =
        result.totalImpacted === 0
          ? `renamed "${note.title}" → "${title}"`
          : `renamed — ${result.updatedCount}/${result.totalImpacted} referencing files updated${
              result.failures.length > 0
                ? `; failed: ${result.failures.map((f) => f.path).join(', ')}`
                : ''
            }`;
      setRenameStatus({ message, isError: result.failures.length > 0 });
      // A rename can affect a tab even when it's not the active one (a note
      // renamed from elsewhere, e.g. the sidebar, while open in the
      // background) — so this remaps by tab id, not just the active path.
      renameTabId(`${vaultRoot}/${note.path}`, `${vaultRoot}/${result.newPath}`);
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
      throw error;
    }
  }

  async function commitRename(note: NoteSummary) {
    const title = renameValue.trim();
    setRenamingId(null);
    await performRename(note, title).catch(() => {});
  }

  /** Renames the currently open note — backs the editor's title field. */
  async function renameActiveNote(newTitle: string) {
    if (!activeNote) return;
    await performRename(activeNote, newTitle);
  }

  const activeRelativePath = activePath ? toRelativePath(vaultRoot, activePath) : null;
  const activeNote = allNotes?.find((note) => note.path === activeRelativePath) ?? null;

  return (
    <AppShell
      sidebar={
        <Sidebar side="left">
          <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
            [vault]
          </span>
          <button
            type="button"
            onClick={() => void createNote()}
            className="border border-border px-2 py-1 text-left text-fg-prominent tracking-menu uppercase transition-colors duration-panel ease-panel hover:border-border-strong"
            style={{ fontSize: '0.72rem' }}
          >
            + new note
          </button>
          <SearchPanel vaultRoot={vaultRoot} onSelect={openRelativePath} />
          <TagBrowser vaultRoot={vaultRoot} selectedTag={selectedTag} onSelectTag={setSelectedTag} />
          <NoteList
            notes={notes ?? []}
            activePath={activeRelativePath}
            renamingId={renamingId}
            renameValue={renameValue}
            onSelect={openRelativePath}
            onStartRename={startRename}
            onRenameChange={setRenameValue}
            onRenameCommit={commitRename}
            onRenameCancel={() => setRenamingId(null)}
          />
          {renameStatus && (
            <span
              className={renameStatus.isError ? 'text-accent-link-broken' : 'text-fg-faint'}
              style={{ fontSize: '0.68rem' }}
            >
              [{renameStatus.message}]
            </span>
          )}
        </Sidebar>
      }
      inspector={
        <Sidebar side="right">
          <BacklinksPanel vaultRoot={vaultRoot} noteId={activeNote?.id ?? null} onSelect={openRelativePath} />
          <UnresolvedLinksPanel vaultRoot={vaultRoot} onSelect={openRelativePath} onChanged={refreshNotes} />
        </Sidebar>
      }
      statusBar={
        <StatusBar
          vaultRoot={vaultRoot}
          noteCount={allNotes?.length ?? 0}
          unresolvedCount={unresolvedCount}
          isReadingMode={isReadingMode}
          onToggleReadingMode={() => setIsReadingMode((mode) => !mode)}
          isGraphMode={isGraphMode}
          onToggleGraphMode={() => setIsGraphMode((mode) => !mode)}
        />
      }
    >
      <div className="flex h-full flex-col">
        {/* macOS gets tabs inline in the window header (TitleBar) instead —
            this fallback row only renders where that header doesn't exist. */}
        {platform() !== 'macos' && !isGraphMode && (
          <TabBar
            tabs={tabItems}
            activeTabId={activeTabId}
            onSelect={setActiveTabId}
            onClose={closeTab}
            className="shrink-0 border-b border-border"
          />
        )}
        <div className="min-h-0 flex-1">
          {isGraphMode ? (
            <GraphPanel
              vaultRoot={vaultRoot}
              activePath={activeRelativePath}
              onSelect={(path) => {
                openRelativePath(path);
                setIsGraphMode(false);
              }}
            />
          ) : activePath ? (
            <Editor
              key={activePath}
              path={activePath}
              vaultRoot={vaultRoot}
              onNavigate={openRelativePath}
              onRenameTitle={renameActiveNote}
              readOnly={isReadingMode}
            />
          ) : (
            <div className="h-full" />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function App() {
  const { vaultRoot, status, initFromConfig } = useVaultStore();
  const initSettings = useSettingsStore((state) => state.initFromConfig);

  // Tab state lives here (not in VaultReady) so the macOS window header
  // (TitleBar, a sibling of VaultReady) can render the same tabs.
  const [tabs, setTabs] = useState<string[]>([HOME_TAB_ID]);
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB_ID);

  /** Opens a note's tab, focusing it if already open rather than duplicating it. */
  function openAbsolutePath(absolutePath: string) {
    setTabs((prev) => (prev.includes(absolutePath) ? prev : [...prev, absolutePath]));
    setActiveTabId(absolutePath);
  }

  /** Closes a tab. The HOME tab is pinned and ignores this. Closing the
   *  active tab falls back to its left neighbor, then HOME. */
  function closeTab(tabId: string) {
    if (tabId === HOME_TAB_ID) return;
    const index = tabs.indexOf(tabId);
    if (index === -1) return;
    const next = tabs.filter((id) => id !== tabId);
    setTabs(next);
    if (activeTabId === tabId) {
      setActiveTabId(next[index - 1] ?? next[0] ?? HOME_TAB_ID);
    }
  }

  function renameTabId(oldId: string, newId: string) {
    setTabs((prev) => prev.map((id) => (id === oldId ? newId : id)));
    if (activeTabId === oldId) setActiveTabId(newId);
  }

  useEffect(() => {
    void initFromConfig();
    void initSettings();
  }, [initFromConfig, initSettings]);

  const tabItems: TabItem[] = tabs.map((id) => ({
    id,
    label: id === HOME_TAB_ID ? 'home' : titleFromPath(id),
    closable: id !== HOME_TAB_ID,
  }));

  return (
    <div className="flex h-full flex-col">
      <TitleBar tabs={tabItems} activeTabId={activeTabId} onSelectTab={setActiveTabId} onCloseTab={closeTab} />
      <div className="min-h-0 flex-1">
        {status === 'loading' && !vaultRoot ? (
          <main className="flex h-full flex-col items-center justify-center">
            <span className="text-fg-muted tracking-menu uppercase" style={{ fontSize: '0.78rem' }}>
              loading…
            </span>
          </main>
        ) : !vaultRoot ? (
          <VaultPicker />
        ) : (
          <VaultReady
            vaultRoot={vaultRoot}
            activeTabId={activeTabId}
            tabItems={tabItems}
            setActiveTabId={setActiveTabId}
            openAbsolutePath={openAbsolutePath}
            closeTab={closeTab}
            renameTabId={renameTabId}
          />
        )}
      </div>
    </div>
  );
}

export default App;
