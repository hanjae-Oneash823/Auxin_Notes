import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { Editor } from './editor/Editor';
import { VaultPicker } from './app/firstRun/VaultPicker';
import { getDb } from './db/client';
import { listNotes, type NoteSummary } from './db/queries/notes';
import { getUnresolvedLinkGroups } from './db/queries/links';
import { syncFile, syncRemoved, toRelativePath } from './vault/syncEngine';
import { renameNote } from './vault/renameEngine';
import { createFolder, deleteFolder, moveFolder, moveNoteToFolder, renameFolder } from './vault/folderEngine';
import { useVaultStore } from './vault/vaultStore';
import { useSettingsStore } from './app/settings/settingsStore';
import { AppShell } from './layout/AppShell';
import { IconRail, type SidebarView } from './layout/IconRail';
import { Sidebar } from './layout/Sidebar';
import { StatusBar } from './layout/StatusBar';
import { HOME_TAB_ID, TabBar, type TabItem } from './layout/TabBar';
import { TitleBar } from './layout/TitleBar';
import { ConfirmDialog } from './layout/ConfirmDialog';
import { reorderIds } from './layout/tabOrder';
import { titleFromPath } from './vault/noteTitle';
import { HomeDashboard } from './notes/HomeDashboard';
import { FolderTree } from './notes/FolderTree';
import { TagBrowser } from './notes/TagBrowser';
import { BacklinksPanel } from './notes/BacklinksPanel';
import { UnresolvedLinksPanel } from './notes/UnresolvedLinksPanel';
import { SearchPanel } from './search/SearchPanel';
import { GraphPanel } from './graph/GraphPanel';

async function fetchNotes(vaultRoot: string, tag: string | null): Promise<NoteSummary[]> {
  const db = await getDb(vaultRoot);
  return listNotes(db, tag ? { tag } : {});
}

async function fetchUnresolvedCount(vaultRoot: string): Promise<number> {
  const db = await getDb(vaultRoot);
  return (await getUnresolvedLinkGroups(db)).length;
}

/** Every folder on disk, vault-relative — includes empty ones, unlike
 *  deriving folders from note paths alone (see folderTree.ts). */
async function fetchFolders(vaultRoot: string): Promise<string[]> {
  const absolutePaths = await invoke<string[]>('list_vault_folders', { root: vaultRoot });
  return absolutePaths.map((path) => toRelativePath(vaultRoot, path));
}

interface VaultReadyProps {
  vaultRoot: string;
  activeTabId: string;
  tabItems: TabItem[];
  setActiveTabId: (id: string) => void;
  openAbsolutePath: (absolutePath: string) => void;
  closeTab: (id: string) => void;
  renameTabId: (oldId: string, newId: string) => void;
  remapTabsUnderFolder: (oldAbsolutePrefix: string, newAbsolutePrefix: string) => void;
  closeTabsUnderFolder: (absolutePrefix: string) => void;
  reorderTabs: (draggedId: string, targetId: string, placeAfter: boolean) => void;
}

function VaultReady({
  vaultRoot,
  activeTabId,
  tabItems,
  setActiveTabId,
  openAbsolutePath,
  closeTab,
  renameTabId,
  remapTabsUnderFolder,
  closeTabsUnderFolder,
  reorderTabs,
}: VaultReadyProps) {
  const setSidebarWidthLeft = useSettingsStore((state) => state.setSidebarWidthLeft);
  const setSidebarWidthRight = useSettingsStore((state) => state.setSidebarWidthRight);
  // allNotes is unfiltered — needed so the active note can still be found
  // by id (for BacklinksPanel) even when a tag filter hides it from the
  // displayed `notes` list.
  const [allNotes, setAllNotes] = useState<NoteSummary[] | null>(null);
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const activePath = activeTabId === HOME_TAB_ID ? null : activeTabId;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameStatus, setRenameStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'note'; note: NoteSummary } | { kind: 'folder'; path: string } | null
  >(null);
  // Resets to writing mode on every app launch — not persisted, deliberately.
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [isGraphMode, setIsGraphMode] = useState(false);
  // Which view the icon rail has selected for the left sidebar — resets to
  // 'files' on every app launch, same as reading mode above.
  const [activeSidebarView, setActiveSidebarView] = useState<SidebarView>('files');

  async function refreshNotes() {
    const [all, unresolved, folders] = await Promise.all([
      fetchNotes(vaultRoot, null),
      fetchUnresolvedCount(vaultRoot),
      fetchFolders(vaultRoot),
    ]);
    setAllNotes(all);
    setNotes(selectedTag ? await fetchNotes(vaultRoot, selectedTag) : all);
    setUnresolvedCount(unresolved);
    setFolderPaths(folders);
  }

  const syncVersion = useVaultStore((state) => state.syncVersion);

  useEffect(() => {
    void refreshNotes();
  }, [vaultRoot, selectedTag, syncVersion]);

  function openRelativePath(relativePath: string) {
    openAbsolutePath(`${vaultRoot}/${relativePath}`);
  }

  /** `folderPath` targets a specific folder (e.g. from its context menu's
   *  "new note here") — omitted, it lands at the vault root like the
   *  sidebar's "+ new note" button. */
  async function createNote(folderPath?: string) {
    const title = `Untitled ${Date.now()}`;
    const absolutePath = folderPath ? `${vaultRoot}/${folderPath}/${title}.md` : `${vaultRoot}/${title}.md`;
    await invoke('write_note', { path: absolutePath, content: '' });
    await syncFile(vaultRoot, absolutePath);
    await refreshNotes();
    openAbsolutePath(absolutePath);
    // A freshly created note is opened to be written into — reading mode
    // would make it immediately non-editable with no obvious way to start.
    setIsReadingMode(false);
  }

  /** Reveals a note or folder's file in the OS file explorer (Finder). */
  async function revealNote(note: NoteSummary) {
    await revealItemInDir(`${vaultRoot}/${note.path}`);
  }

  async function revealFolder(folderPath: string) {
    await revealItemInDir(`${vaultRoot}/${folderPath}`);
  }

  /** Permanently deletes a note's file. Closes its tab (a no-op if it isn't
   *  open) and marks it deleted in the index the same way syncEngine does
   *  when it notices a file vanish from disk on its own. Called only after
   *  `pendingDelete`'s confirmation card has been accepted. */
  async function deleteNote(note: NoteSummary) {
    const absolutePath = `${vaultRoot}/${note.path}`;
    try {
      await invoke('delete_note', { path: absolutePath });
      await syncRemoved(vaultRoot, absolutePath);
      closeTab(absolutePath);
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  /** Permanently deletes a folder and everything inside it, closing any open
   *  tabs that lived under it. Called only after `pendingDelete`'s
   *  confirmation card has been accepted. */
  async function deleteFolderHandler(folderPath: string) {
    try {
      await deleteFolder(vaultRoot, folderPath);
      closeTabsUnderFolder(`${vaultRoot}/${folderPath}`);
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
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

  /** Drag-drop: moves a note into a different folder. Title/id stay put, so
   *  (unlike a folder move) at most one open tab ever needs remapping. */
  async function handleMoveNote(note: NoteSummary, targetFolderPath: string) {
    try {
      const newPath = await moveNoteToFolder(vaultRoot, note, targetFolderPath);
      if (newPath === note.path) return;
      renameTabId(`${vaultRoot}/${note.path}`, `${vaultRoot}/${newPath}`);
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  /** Drag-drop: moves a folder (and everything inside it) into a different
   *  parent — every open tab under it needs remapping, not just one. */
  async function handleMoveFolder(folderPath: string, targetParentPath: string) {
    try {
      const newPath = await moveFolder(vaultRoot, folderPath, targetParentPath);
      if (newPath === folderPath) return;
      remapTabsUnderFolder(`${vaultRoot}/${folderPath}`, `${vaultRoot}/${newPath}`);
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  async function handleRenameFolder(folderPath: string, newName: string) {
    try {
      const newPath = await renameFolder(vaultRoot, folderPath, newName);
      if (newPath === folderPath) return;
      remapTabsUnderFolder(`${vaultRoot}/${folderPath}`, `${vaultRoot}/${newPath}`);
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  async function commitCreateFolder() {
    const name = newFolderName.trim();
    setIsCreatingFolder(false);
    setNewFolderName('');
    if (!name) return;
    try {
      await createFolder(vaultRoot, name);
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  const activeRelativePath = activePath ? toRelativePath(vaultRoot, activePath) : null;
  const activeNote = allNotes?.find((note) => note.path === activeRelativePath) ?? null;

  return (
    <AppShell
      sidebar={
        <div className="flex">
          <IconRail
            activeSidebarView={activeSidebarView}
            onSelectSidebarView={setActiveSidebarView}
            isGraphMode={isGraphMode}
            onToggleGraphMode={() => setIsGraphMode((mode) => !mode)}
          />
          <Sidebar side="left" onResizeEnd={(px) => void setSidebarWidthLeft(px)}>
            {activeSidebarView === 'files' && (
              <>
                <div className="flex flex-col gap-3 pr-3">
                  <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
                    [vault]
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void createNote()}
                      className="flex-1 border border-border px-2 py-1 text-left tracking-menu uppercase transition-colors duration-panel ease-panel hover:border-border-strong"
                      style={{ fontSize: '0.72rem' }}
                    >
                      <span className="text-fg-faint">[+]</span> <span className="text-fg-prominent">note</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingFolder(true);
                        setNewFolderName('');
                      }}
                      className="flex-1 border border-border px-2 py-1 text-left tracking-menu uppercase transition-colors duration-panel ease-panel hover:border-border-strong"
                      style={{ fontSize: '0.72rem' }}
                    >
                      <span className="text-fg-faint">[+]</span> <span className="text-fg-prominent">folder</span>
                    </button>
                  </div>
                  {isCreatingFolder && (
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(event) => setNewFolderName(event.target.value)}
                      onBlur={() => setIsCreatingFolder(false)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void commitCreateFolder();
                        if (event.key === 'Escape') setIsCreatingFolder(false);
                      }}
                      placeholder="folder name"
                      className="w-full border border-border-strong bg-transparent px-1 py-1 text-left text-fg-prominent outline-none"
                      style={{ fontSize: '0.72rem' }}
                    />
                  )}
                </div>
                <FolderTree
                  notes={notes ?? []}
                  folderPaths={folderPaths}
                  activePath={activeRelativePath}
                  renamingNoteId={renamingId}
                  renameValue={renameValue}
                  onSelect={openRelativePath}
                  onStartRename={startRename}
                  onRenameChange={setRenameValue}
                  onRenameCommit={commitRename}
                  onRenameCancel={() => setRenamingId(null)}
                  onMoveNote={(note, targetFolderPath) => void handleMoveNote(note, targetFolderPath)}
                  onMoveFolder={(folderPath, targetParentPath) => void handleMoveFolder(folderPath, targetParentPath)}
                  onRenameFolder={(folderPath, newName) => void handleRenameFolder(folderPath, newName)}
                  onDeleteNote={(note) => setPendingDelete({ kind: 'note', note })}
                  onDeleteFolder={(folderPath) => setPendingDelete({ kind: 'folder', path: folderPath })}
                  onRevealNote={(note) => void revealNote(note)}
                  onRevealFolder={(folderPath) => void revealFolder(folderPath)}
                  onNewNoteInFolder={(folderPath) => void createNote(folderPath)}
                  onNewFolderAtRoot={() => {
                    setIsCreatingFolder(true);
                    setNewFolderName('');
                  }}
                />
              </>
            )}
            {activeSidebarView === 'search' && (
              <div className="pr-3">
                <SearchPanel vaultRoot={vaultRoot} onSelect={openRelativePath} />
              </div>
            )}
            {activeSidebarView === 'tags' && (
              <div className="pr-3">
                <TagBrowser vaultRoot={vaultRoot} selectedTag={selectedTag} onSelectTag={setSelectedTag} />
              </div>
            )}
            {pendingDelete && (
              <ConfirmDialog
                message={
                  pendingDelete.kind === 'note'
                    ? `Delete "${pendingDelete.note.title}"? This can't be undone.`
                    : `Delete "${pendingDelete.path.split('/').pop()}" and everything inside it? This can't be undone.`
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                  if (pendingDelete.kind === 'note') void deleteNote(pendingDelete.note);
                  else void deleteFolderHandler(pendingDelete.path);
                  setPendingDelete(null);
                }}
              />
            )}
            {renameStatus && (
              <span
                className={`pr-3 ${renameStatus.isError ? 'text-accent-link-broken' : 'text-fg-faint'}`}
                style={{ fontSize: '0.68rem' }}
              >
                [{renameStatus.message}]
              </span>
            )}
          </Sidebar>
        </div>
      }
      inspector={
        <Sidebar side="right" onResizeEnd={(px) => void setSidebarWidthRight(px)}>
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
            onReorder={reorderTabs}
            className="shrink-0 border-b-[1.5px] border-b-border-strong"
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
            <HomeDashboard
              noteCount={allNotes?.length ?? 0}
              unresolvedCount={unresolvedCount}
              recentNotes={allNotes ?? []}
              onSelect={openRelativePath}
            />
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

  /** Remaps every open tab whose id sits under `oldAbsolutePrefix` (a moved
   *  or renamed folder) to the equivalent path under `newAbsolutePrefix` —
   *  unlike `renameTabId`'s single-note remap, a folder move can shift many
   *  open notes' paths at once. */
  function remapTabsUnderFolder(oldAbsolutePrefix: string, newAbsolutePrefix: string) {
    const withSlash = `${oldAbsolutePrefix}/`;
    function remap(id: string): string {
      return id.startsWith(withSlash) ? `${newAbsolutePrefix}/${id.slice(withSlash.length)}` : id;
    }
    setTabs((prev) => prev.map(remap));
    if (activeTabId.startsWith(withSlash)) setActiveTabId(remap(activeTabId));
  }

  /** Closes every open tab whose id sits under `absolutePrefix` — a deleted
   *  folder's counterpart to `remapTabsUnderFolder`'s move/rename case, since
   *  a delete has nowhere to remap those tabs to. Computes the full next
   *  tab list in one `setTabs` call rather than looping `closeTab` per id —
   *  each call there reads the same pre-render `tabs` closure, so a loop
   *  would have every iteration but the last clobber the ones before it. */
  function closeTabsUnderFolder(absolutePrefix: string) {
    const withSlash = `${absolutePrefix}/`;
    const removedSet = new Set(tabs.filter((id) => id.startsWith(withSlash)));
    if (removedSet.size === 0) return;
    const next = tabs.filter((id) => !removedSet.has(id));
    setTabs(next);
    if (!removedSet.has(activeTabId)) return;
    const originalIndex = tabs.indexOf(activeTabId);
    const priorSurvivor = [...next].reverse().find((id) => tabs.indexOf(id) < originalIndex);
    setActiveTabId(priorSurvivor ?? next[0] ?? HOME_TAB_ID);
  }

  /** Moves `draggedId` to sit next to `targetId` — after it when `placeAfter`
   *  is true, so dropping past the last tab (placeAfter on the last tab) can
   *  still reach the rightmost position. The HOME tab is pinned first and
   *  never participates — TabBar already refuses to make it draggable or a
   *  drop target, this is the belt-and-suspenders check. */
  function reorderTabs(draggedId: string, targetId: string, placeAfter: boolean) {
    if (draggedId === HOME_TAB_ID || targetId === HOME_TAB_ID) return;
    setTabs((prev) => reorderIds(prev, draggedId, targetId, placeAfter));
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
      <TitleBar
        tabs={tabItems}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
        onReorderTabs={reorderTabs}
      />
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
            remapTabsUnderFolder={remapTabsUnderFolder}
            closeTabsUnderFolder={closeTabsUnderFolder}
            reorderTabs={reorderTabs}
          />
        )}
      </div>
    </div>
  );
}

export default App;
