import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { Editor } from './editor/Editor';
import { VaultPicker } from './app/firstRun/VaultPicker';
import { getDb } from './db/client';
import { listNotes, type NoteSummary } from './db/queries/notes';
import { getUnresolvedLinkGroups } from './db/queries/links';
import { syncFile, syncRemoved, toRelativePath } from './vault/syncEngine';
import { logUsageEvent } from './db/usageEvents';
import { renameNote } from './vault/renameEngine';
import { createFolder, deleteFolder, moveFolder, moveNoteToFolder, renameFolder } from './vault/folderEngine';
import { useVaultStore } from './vault/vaultStore';
import { useSettingsStore } from './app/settings/settingsStore';
import { AppShell } from './layout/AppShell';
import { SidebarNav } from './layout/SidebarNav';
import { WorkspaceScratchpad } from './layout/WorkspaceScratchpad';
import { RightPanelHeader } from './layout/RightPanel';
import { RIGHT_PANEL_LAYERS, usePanelLayoutStore } from './layout/panelLayoutStore';
import { AnimatePresence, motion } from 'framer-motion';
import { FilePdf, FilePlus, FolderPlus, Stack, X } from '@phosphor-icons/react';
import { animateCloseAll } from './layout/tabCloseAnimation';
import { animateFolderDelete } from './layout/folderDeleteAnimation';
import { flyCardToTab } from './layout/flyToTab';
import { panTabContent, type PanDirection } from './layout/panTransition';
import { PacketIconButton, SidebarPacket } from './layout/SidebarPacket';
import { Sidebar } from './layout/Sidebar';
import { StatusBar } from './layout/StatusBar';
import { HOME_TAB_ID, TabBar, type TabItem } from './layout/TabBar';
import { buildTabGroupTree, flattenTabGroups } from './layout/tabGroups';
import { WindowChrome } from './layout/WindowChrome';
import { ConfirmDialog } from './layout/ConfirmDialog';
import { useWorkspaces } from './layout/useWorkspaces';
import { CloseAllTabsButton } from './layout/CloseAllTabsButton';
import { WorkspaceSwitcher } from './layout/WorkspaceSwitcher';
import { titleFromPath } from './vault/noteTitle';
import { HomeDashboard } from './notes/HomeDashboard';
import { HubView } from './notes/HubView';
import { formatFolder } from './notes/noteStats';
import { useOpenNoteStats } from './notes/useOpenNoteStats';
import { CanvasView } from './canvas/CanvasView';
import { PdfView } from './pdf/PdfView';
import { ImportedPdfsDock } from './pdf/ImportedPdfsDock';
import { createPdfNote, deletePdf, listPdfSummaries, movePdfPair, renamePdfPair } from './pdf/pdfEngine';
import { isPdfPath, mergePdfNotes, notePathForPdf, pdfPathForNote } from './pdf/pdfFiles';
import { CANVAS_EXTENSION } from './vault/canvasTypes';
import { FolderTree } from './notes/FolderTree';
import { BubbleNavigatorView } from './notes/BubbleNavigatorView';
import { TagBrowser } from './notes/TagBrowser';
import { BacklinksPanel } from './notes/BacklinksPanel';
import { TocPanel } from './notes/TocPanel';
import { UnresolvedLinksPanel } from './notes/UnresolvedLinksPanel';
import { SearchPanel } from './search/SearchPanel';
import { GraphPanel } from './graph/GraphPanel';
import { Graph2DPanel } from './graph/Graph2DPanel';
import { TerminalLauncher } from './terminal/TerminalLauncher';
import { AgentStopConfirm } from './terminal/terminalAgent';
import { agentTargetFromPath } from './terminal/terminalAgentPrompt';
import { TerminalPane } from './terminal/TerminalPane';
import { useStickyStore } from './sticky/stickyStore';
import { useGlobalCaptureShortcut } from './sticky/useGlobalCaptureShortcut';
import { StickyBoard } from './sticky/StickyBoard';
import { FileBrowser } from './notes/FileBrowser';
import { isInTrash, isTrashFolder, TRASH_FOLDER } from './vault/trash';
import type { FolderTreeProps } from './notes/FolderTree';
import { PinnedDock } from './sticky/PinnedDock';
import { useGlobalFileSearcherShortcut } from './fileSearcher/useGlobalFileSearcherShortcut';
import { useFileSearcherNoteListener } from './fileSearcher/useFileSearcherNoteListener';

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
  /** Restored focus waiting for the note index to load before it is applied. */
  pendingActiveId: string | null;
  onPendingActiveApplied: () => void;
  tabItems: TabItem[];
  setActiveTabId: (id: string) => void;
  openAbsolutePath: (absolutePath: string) => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  toggleFlag: (tabId: string) => void;
  moveTabToWorkspace: (tabId: string, workspaceName: string) => void;
  duplicateTabToWorkspace: (tabId: string, workspaceName: string) => void;
  renameTabId: (oldId: string, newId: string) => void;
  remapTabsUnderFolder: (oldAbsolutePrefix: string, newAbsolutePrefix: string) => void;
  removeTabsEverywhere: (shouldRemove: (tabId: string) => boolean) => void;
  reorderTabs: (draggedId: string, targetId: string, placeAfter: boolean) => void;
  workspaceNames: string[];
  currentWorkspace: string;
  stepWorkspace: (step: 1 | -1) => string | null;
  scratchpad: string;
  setScratchpad: (text: string) => void;
  workspaceColors: Record<string, string | null>;
  setWorkspaceColor: (name: string, color: string | null) => void;
  switchWorkspace: (name: string) => void;
  renameWorkspace: (name: string, newName: string) => string | null;
  createWorkspace: (name: string) => string | null;
  deleteWorkspace: (name: string) => void;
}

/** Passed to flattenTabGroups when computing the keyboard-shortcut tab
 *  order — always "nothing collapsed" so a tab stays reachable by shortcut
 *  even while its group is visually collapsed in the sidebar. */
const EMPTY_COLLAPSED_PATHS = new Set<string>();

function VaultReady({
  vaultRoot,
  activeTabId,
  pendingActiveId,
  onPendingActiveApplied,
  tabItems,
  setActiveTabId,
  openAbsolutePath,
  closeTab,
  closeAllTabs,
  toggleFlag,
  moveTabToWorkspace,
  duplicateTabToWorkspace,
  renameTabId,
  remapTabsUnderFolder,
  removeTabsEverywhere,
  reorderTabs,
  workspaceNames,
  currentWorkspace,
  stepWorkspace,
  scratchpad,
  setScratchpad,
  workspaceColors,
  setWorkspaceColor,
  switchWorkspace,
  renameWorkspace,
  createWorkspace: createWorkspaceNamed,
  deleteWorkspace,
}: VaultReadyProps) {
  const setSidebarWidthLeft = useSettingsStore((state) => state.setSidebarWidthLeft);
  const setSidebarWidthRight = useSettingsStore((state) => state.setSidebarWidthRight);
  // allNotes is unfiltered — needed so the active note can still be found
  // by id (for BacklinksPanel) even when a tag filter hides it from the
  // displayed `notes` list.
  const [allNotes, setAllNotes] = useState<NoteSummary[] | null>(null);
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  // PDFs are listed from disk, not the index (see pdf/pdfFiles.ts).
  const [pdfNotes, setPdfNotes] = useState<NoteSummary[]>([]);
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
  const [isGraph2DMode, setIsGraph2DMode] = useState(false);
  const [isStickyMode, setIsStickyMode] = useState(false);
  const [isBubbleMode, setIsBubbleMode] = useState(false);
  const loadStickyNotes = useStickyStore((state) => state.load);
  useGlobalCaptureShortcut();
  useGlobalFileSearcherShortcut();
  useFileSearcherNoteListener(openRelativePath, (folderPath) => {
    // The finder spells the vault root as '', createNote as no folder at all.
    createNote(folderPath || undefined).catch((error: unknown) => {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    });
  });
  // Lets a hub note's "edit source" button show the plain Editor for that one
  // tab instead of HubView — cleared implicitly by switching away (the
  // render check below compares against the currently active path, so
  // leaving and reopening the tab starts fresh in HubView).
  const [forceEditPath, setForceEditPath] = useState<string | null>(null);
  // Whether the pinned-notes dock is open under the left nav — resets on
  // every app launch, same as reading mode above.
  const [isPinnedOpen, setIsPinnedOpen] = useState(false);
  // Same idea for the imported-PDFs list under the left nav.
  const [isPdfsOpen, setIsPdfsOpen] = useState(false);
  useEffect(() => {
    if (!isPdfsOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsPdfsOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPdfsOpen]);
  const activeRightLayer = usePanelLayoutStore((state) => state.activeRightLayer);
  // Slide in from the side the picked tab is on (right-panel tabs read left to right).
  const previousLayerRef = useRef(activeRightLayer);
  const layerDirection =
    Math.sign(RIGHT_PANEL_LAYERS.indexOf(activeRightLayer) - RIGHT_PANEL_LAYERS.indexOf(previousLayerRef.current)) || 1;
  useEffect(() => {
    previousLayerRef.current = activeRightLayer;
  }, [activeRightLayer]);
  const layerEnterStyle = { '--layer-from': `${layerDirection * 14}px` } as CSSProperties;
  // The terminal spawns on the first visit to its layer, then stays mounted
  // (hidden) so its shell and scrollback survive switching layers.
  const [hasOpenedTerminal, setHasOpenedTerminal] = useState(false);
  useEffect(() => {
    if (activeRightLayer === 'terminal') setHasOpenedTerminal(true);
  }, [activeRightLayer]);
  const setRightLayer = usePanelLayoutStore((state) => state.setRightLayer);
  const isRightSidebarOpen = usePanelLayoutStore((state) => state.isRightSidebarOpen);
  const toggleRightSidebar = usePanelLayoutStore((state) => state.toggleSidebar);

  /** Home dashboard's tag chips — filters by the tag (same state TagBrowser
   *  drives) and jumps the right panel to the layer that shows it, opening
   *  that sidebar first if it's currently collapsed. */
  function openTagFromDashboard(tag: string) {
    setSelectedTag(tag);
    setRightLayer('links');
    if (!isRightSidebarOpen) toggleRightSidebar('right');
  }

  async function refreshNotes() {
    const [all, unresolved, folders, pdfs] = await Promise.all([
      fetchNotes(vaultRoot, null),
      fetchUnresolvedCount(vaultRoot),
      fetchFolders(vaultRoot),
      listPdfSummaries(vaultRoot),
    ]);
    setAllNotes(all);
    setPdfNotes(pdfs);
    setNotes(selectedTag ? await fetchNotes(vaultRoot, selectedTag) : all);
    setUnresolvedCount(unresolved);
    // The bin always exists, so it shows in the tree/browser even when empty.
    if (!folders.includes(TRASH_FOLDER)) {
      await invoke('ensure_dir', { path: `${vaultRoot}/${TRASH_FOLDER}` });
      setFolderPaths([...folders, TRASH_FOLDER]);
      return;
    }
    setFolderPaths(folders);
  }

  const syncVersion = useVaultStore((state) => state.syncVersion);

  useEffect(() => {
    void refreshNotes();
  }, [vaultRoot, selectedTag, syncVersion]);

  useEffect(() => {
    void loadStickyNotes(vaultRoot);
  }, [vaultRoot, loadStickyNotes]);

  // Restored focus: applied only once the note index has loaded (see App).
  useEffect(() => {
    if (pendingActiveId === null || allNotes === null) return;
    setActiveTabId(pendingActiveId);
    onPendingActiveApplied();
  }, [pendingActiveId, allNotes, setActiveTabId, onPendingActiveApplied]);

  /** Picking a tab leaves any full-area mode (graphs, sticky board) — with
   *  the tab list always visible in the sidebar, a click there has to land on
   *  that tab's content, not stay behind the mode. */
  function selectTab(tabId: string) {
    setIsGraphMode(false);
    setIsGraph2DMode(false);
    setIsStickyMode(false);
    setIsBubbleMode(false);
    setActiveTabId(tabId);
  }

  function openRelativePath(relativePath: string) {
    // A note fused to a PDF (search, backlinks, wikilinks all land here by
    // the note's path) opens as that PDF's split view instead.
    const pdfPath = relativePath.endsWith('.md') ? pdfPathForNote(relativePath) : null;
    const target = pdfPath && pdfNotes.some((pdf) => pdf.path === pdfPath) ? pdfPath : relativePath;
    setIsBubbleMode(false);
    openAbsolutePath(`${vaultRoot}/${target}`);
  }

  /** File-picker import: copies each chosen PDF into `folderPath` ('' = vault
   *  root) and opens the last one. Nothing is parsed or indexed. */
  async function importPdfs(folderPath: string) {
    try {
      const picked = await openDialog({ multiple: true, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (!picked) return;
      const destDir = folderPath ? `${vaultRoot}/${folderPath}` : vaultRoot;
      let lastImported: string | null = null;
      for (const sourcePath of Array.isArray(picked) ? picked : [picked]) {
        lastImported = await invoke<string>('import_file', { destDir, sourcePath });
      }
      await refreshNotes();
      if (lastImported) openAbsolutePath(lastImported);
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  /** "+ add note" on a note-less PDF — the split view appears once refreshed. */
  async function addNoteToPdf(pdf: NoteSummary, content?: string) {
    try {
      await createPdfNote(vaultRoot, pdf.path, content);
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  /** `folderPath` targets a specific folder (e.g. from its context menu's
   *  "new note here") — omitted, it lands at the vault root like the
   *  sidebar's "+ new note" button. */
  async function createNote(folderPath?: string) {
    const title = `Untitled ${Date.now()}`;
    const relativePath = folderPath ? `${folderPath}/${title}.md` : `${title}.md`;
    const absolutePath = `${vaultRoot}/${relativePath}`;
    await invoke('write_note', { path: absolutePath, content: '' });
    await syncFile(vaultRoot, absolutePath);
    void logUsageEvent(vaultRoot, { type: 'create', path: relativePath, title }).catch((error: unknown) =>
      console.error('[usage] failed to log event', error),
    );
    await refreshNotes();
    openAbsolutePath(absolutePath);
    // A freshly created note is opened to be written into — reading mode
    // would make it immediately non-editable with no obvious way to start.
    setIsReadingMode(false);
  }

  /** Same shape as `createNote`, but writes a `.axcanvas` file seeded with an
   *  empty board — an ordinary filename collision (not a deterministic
   *  one-per-folder singleton like `createHub`) since a folder can hold many
   *  canvases. */
  async function createCanvas(folderPath?: string) {
    const title = `Untitled Canvas ${Date.now()}`;
    const relativePath = folderPath ? `${folderPath}/${title}${CANVAS_EXTENSION}` : `${title}${CANVAS_EXTENSION}`;
    const absolutePath = `${vaultRoot}/${relativePath}`;
    const content = JSON.stringify({ version: 1, cards: [], groups: [], arrows: [] });
    await invoke('write_note', { path: absolutePath, content });
    await syncFile(vaultRoot, absolutePath);
    void logUsageEvent(vaultRoot, { type: 'create', path: relativePath, title, detail: { kind: 'canvas' } }).catch(
      (error: unknown) => console.error('[usage] failed to log event', error),
    );
    await refreshNotes();
    openAbsolutePath(absolutePath);
  }

  /** Same shape as `createNote`, but pre-fills the fenced ```hub config block
   *  (see parseHubBlock.ts) scoped to `folderPath` — the note opens straight
   *  into HubView (App.tsx's render branch below keys off notes.is_hub, set
   *  by syncEngine.ts as soon as this first sync runs). */
  /** A folder either has a hub or doesn't — the hub's own filename is
   *  deterministic ("<Folder> Hub.md" / "Vault Hub.md" at root) so this is
   *  naturally idempotent: calling it again for a folder that already has
   *  one just opens that hub instead of creating a duplicate. */
  async function createHub(folderPath?: string) {
    const folder = folderPath ?? '';
    const folderName = folder ? folder.split('/').pop() ?? folder : 'Vault';
    const title = `${folderName} Hub`;
    const relativePath = folder ? `${folder}/${title}.md` : `${title}.md`;
    const absolutePath = `${vaultRoot}/${relativePath}`;

    const existing = allNotes?.find((note) => note.path === relativePath);
    if (existing) {
      if (existing.isHub) {
        openAbsolutePath(absolutePath);
      } else {
        // Vanishingly rare: a non-hub note already sits at the exact
        // deterministic hub filename — refuse rather than silently
        // overwriting whatever the user actually wrote there.
        setRenameStatus({ message: `"${title}" already exists here and isn't a hub`, isError: true });
      }
      return;
    }

    const content = ['```hub', `folder: ${folder}`, 'recursive: true', 'sort: modified', 'groupBy: flat', '```', ''].join('\n');
    await invoke('write_note', { path: absolutePath, content });
    await syncFile(vaultRoot, absolutePath);
    void logUsageEvent(vaultRoot, { type: 'create', path: relativePath, title, detail: { kind: 'hub' } }).catch(
      (error: unknown) => console.error('[usage] failed to log event', error),
    );
    await refreshNotes();
    openAbsolutePath(absolutePath);
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
  async function deleteNote(note: NoteSummary, keepNote = false) {
    const absolutePath = `${vaultRoot}/${note.path}`;
    try {
      if (note.isPdf) {
        await deletePdf(vaultRoot, note, keepNote);
        // A kept note stops being fused — the open PDF tab turns into its note's tab.
        if (keepNote) renameTabId(absolutePath, `${vaultRoot}/${notePathForPdf(note.path)}`);
        else removeTabsEverywhere((id) => id === absolutePath);
        await refreshNotes();
        return;
      }
      await invoke('delete_note', { path: absolutePath });
      await syncRemoved(vaultRoot, absolutePath);
      void logUsageEvent(vaultRoot, { type: 'delete', path: note.path, title: note.title }).catch(
        (error: unknown) => console.error('[usage] failed to log event', error),
      );
      removeTabsEverywhere((id) => id === absolutePath);
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  /** Permanently deletes a folder and everything inside it, closing any open
   *  tabs that lived under it. Called only after `pendingDelete`'s
   *  confirmation card has been accepted. */
  async function deleteFolderHandler(folderPath: string) {
    // The exit animation starts first, while the folder's rows and tab group
    // still exist; state only changes once both it and the delete are done.
    const exit = animateFolderDelete(folderPath);
    try {
      await Promise.all([deleteFolder(vaultRoot, folderPath), exit.finished]);
      removeTabsEverywhere((id) => id.startsWith(`${vaultRoot}/${folderPath}/`));
      await refreshNotes();
      exit.release();
    } catch (error: unknown) {
      exit.cancel();
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
      if (note.isPdf) {
        const newPdfPath = await renamePdfPair(vaultRoot, note, title);
        renameTabId(`${vaultRoot}/${note.path}`, `${vaultRoot}/${newPdfPath}`);
        setRenameStatus({ message: `renamed "${note.title}" → "${title}"`, isError: false });
        await refreshNotes();
        return;
      }
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
      const newPath = note.isPdf
        ? await movePdfPair(vaultRoot, note, targetFolderPath)
        : await moveNoteToFolder(vaultRoot, note, targetFolderPath);
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

  /** Delete = move into the bin (recoverable); only items already in the bin are removed for good. */
  async function trashNote(note: NoteSummary) {
    try {
      if (note.isPdf) await movePdfPair(vaultRoot, note, TRASH_FOLDER);
      else await moveNoteToFolder(vaultRoot, note, TRASH_FOLDER);
      removeTabsEverywhere((id) => id === `${vaultRoot}/${note.path}`);
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  async function trashFolder(folderPath: string) {
    try {
      await moveFolder(vaultRoot, folderPath, TRASH_FOLDER);
      removeTabsEverywhere((id) => id.startsWith(`${vaultRoot}/${folderPath}/`));
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  /** Opens the right panel's file browser on the bin. */
  function openTrash() {
    usePanelLayoutStore.getState().setBrowserPath(TRASH_FOLDER);
    setRightLayer('browser');
    if (!isRightSidebarOpen) toggleRightSidebar('right');
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

  /** Right-click "new folder here" (FolderTree.tsx) — unlike
   *  `commitCreateFolder` above, the caller has already picked a full,
   *  collision-free relative path (`uniqueFolderName`), so this just
   *  creates it directly rather than reading the toolbar's typed-name
   *  input. */
  async function handleCreateFolderAt(relativePath: string) {
    try {
      await createFolder(vaultRoot, relativePath);
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  const pendingDeleteFusedNote =
    pendingDelete?.kind === 'note' && pendingDelete.note.isPdf
      ? (allNotes ?? []).some((note) => note.path === notePathForPdf(pendingDelete.note.path))
      : false;

  const activeRelativePath = activePath ? toRelativePath(vaultRoot, activePath) : null;
  const activePdf = activeRelativePath && isPdfPath(activeRelativePath)
    ? pdfNotes.find((pdf) => pdf.path === activeRelativePath) ?? null
    : null;
  const activeNote = activePdf ?? allNotes?.find((note) => note.path === activeRelativePath) ?? null;
  // The indexed note fused to the active PDF (null while the PDF has none).
  const fusedNote = activePdf ? allNotes?.find((note) => note.path === notePathForPdf(activePdf.path)) ?? null : null;
  const treeNotes = mergePdfNotes(notes ?? [], pdfNotes, selectedTag !== null);
  const treeAllNotes = mergePdfNotes(allNotes ?? [], pdfNotes, false);

  // Tab cards show the note's folder, age, length and image count. Word/image
  // counts come from each open note's file (see useOpenNoteStats); canvases
  // are JSON, not prose, so they're skipped.
  const statsPaths = tabItems.filter((tab) => tab.kind === 'note').map((tab) => tab.id);
  const tabStats = useOpenNoteStats(statsPaths, activeTabId);
  const cardTabItems: TabItem[] = tabItems.map((tab) => {
    if (tab.kind === 'home') return tab;
    const relativePath = toRelativePath(vaultRoot, tab.id);
    const note = treeAllNotes.find((candidate) => candidate.path === relativePath);
    const slashIndex = relativePath.lastIndexOf('/');
    return {
      ...tab,
      kind: note?.isHub ? 'hub' : tab.kind,
      folder: formatFolder(relativePath),
      folderPath: slashIndex >= 0 ? relativePath.slice(0, slashIndex) : '',
      modified: note?.modified ?? null,
      stats: tabStats.get(tab.id) ?? null,
    };
  });

  // The content area the keyboard tab shortcuts pan (see panTransition.ts).
  const contentRef = useRef<HTMLDivElement>(null);

  // Cmd+1..9 jumps to that tab (Cmd+1 is always Home); Cmd+Up/Down cycles
  // to the previous/next tab, wrapping at the ends. Ordered to match the
  // sidebar's actual grouped layout (TabBar.tsx: folders alphabetical, tabs
  // within a folder in open-order), not raw open-order across the whole
  // list — always computed as if nothing were collapsed, since collapse
  // state lives locally inside TabBar and a tab is still reachable this way
  // even while its group is visually collapsed. Matched on `code` so both
  // are layout-independent; Cmd+Opt+<key> is left alone.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.metaKey || event.altKey) return;

      const sidebarOrderedTabs = flattenTabGroups(buildTabGroupTree(cardTabItems), EMPTY_COLLAPSED_PATHS)
        .filter((row) => row.kind === 'tab')
        .map((row) => row.tab);

      const pan = (direction: PanDirection) => {
        if (contentRef.current) panTabContent(contentRef.current, direction);
      };
      const currentIndex = sidebarOrderedTabs.findIndex((tab) => tab.id === activeTabId);

      if (/^Digit[1-9]$/.test(event.code)) {
        const targetIndex = Number(event.code.slice(-1)) - 1;
        const target = sidebarOrderedTabs[targetIndex];
        if (!target) return;
        event.preventDefault();
        if (target.id !== activeTabId) pan(targetIndex > currentIndex ? 'down' : 'up');
        selectTab(target.id);
        return;
      }

      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        // Cmd+Left/Right switches workspace — this takes over the editor's
        // "cursor to line start/end" chord, by request.
        if (workspaceNames.length < 2) return;
        event.preventDefault();
        setIsGraphMode(false);
        setIsGraph2DMode(false);
        setIsStickyMode(false);
        setIsBubbleMode(false);
        stepWorkspace(event.code === 'ArrowRight' ? 1 : -1);
        return;
      }

      if ((event.code === 'ArrowUp' || event.code === 'ArrowDown') && sidebarOrderedTabs.length > 1) {
        event.preventDefault();
        const delta = event.code === 'ArrowUp' ? -1 : 1;
        const nextIndex = (currentIndex + delta + sidebarOrderedTabs.length) % sidebarOrderedTabs.length;
        // Direction follows the key, not the index, so wrapping past either
        // end still pans the way the key points.
        pan(delta > 0 ? 'down' : 'up');
        selectTab(sidebarOrderedTabs[nextIndex].id);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Shared by the Files tree and the Browser layer — both edit the same vault.
  const fileTreeProps: FolderTreeProps = {
    vaultRoot,
    notes: treeNotes,
    folderPaths,
    activePath: activeRelativePath,
    renamingNoteId: renamingId,
    renameValue,
    onSelect: openRelativePath,
    onStartRename: startRename,
    onRenameChange: setRenameValue,
    onRenameCommit: commitRename,
    onRenameCancel: () => setRenamingId(null),
    onMoveNote: (note, targetFolderPath) => void handleMoveNote(note, targetFolderPath),
    onMoveFolder: (folderPath, targetParentPath) => void handleMoveFolder(folderPath, targetParentPath),
    onRenameFolder: (folderPath, newName) => void handleRenameFolder(folderPath, newName),
    onDeleteNote: (note) => (isInTrash(note.path) ? setPendingDelete({ kind: 'note', note }) : void trashNote(note)),
    onDeleteFolder: (folderPath) => (isInTrash(folderPath) ? setPendingDelete({ kind: 'folder', path: folderPath }) : void trashFolder(folderPath)),
    onRestoreNote: (note) => void handleMoveNote(note, ''),
    onRestoreFolder: (folderPath) => void handleMoveFolder(folderPath, ''),
    onEmptyTrash: () => setPendingDelete({ kind: 'folder', path: TRASH_FOLDER }),
    onRevealNote: (note) => void revealNote(note),
    onRevealFolder: (folderPath) => void revealFolder(folderPath),
    onNewNoteInFolder: (folderPath) => void createNote(folderPath),
    onNewHubInFolder: (folderPath) => void createHub(folderPath),
    onNewCanvasInFolder: (folderPath) => void createCanvas(folderPath),
    onImportPdfInFolder: (folderPath) => void importPdfs(folderPath),
    onNewFolderAtRoot: () => {
      setIsCreatingFolder(true);
      setNewFolderName('');
    },
    onNewFolderInFolder: (path) => void handleCreateFolderAt(path),
  };

  return (
    <AppShell
      sidebar={
        <Sidebar
          side="left"
          onResizeEnd={(px) => void setSidebarWidthLeft(px)}
          onSwipe={(direction) => {
            setIsStickyMode(false);
            stepWorkspace(direction);
          }}
        >
          <WorkspaceSwitcher
            names={workspaceNames}
            current={currentWorkspace}
            onStep={(step) => {
              setIsStickyMode(false);
              stepWorkspace(step);
            }}
            onCreate={(name) => {
              const error = createWorkspaceNamed(name);
              if (!error) setIsStickyMode(false);
              return error;
            }}
            colors={workspaceColors}
            onColor={setWorkspaceColor}
            onRename={renameWorkspace}
            onDelete={deleteWorkspace}
          />
          <div className="-mt-1.5">
          <SidebarNav
            trashCount={treeNotes.filter((note) => isInTrash(note.path)).length}
            onOpenTrash={openTrash}
            onEmptyTrash={fileTreeProps.onEmptyTrash}
            isPinnedOpen={isPinnedOpen}
            onTogglePinned={() => setIsPinnedOpen((isOpen) => !isOpen)}
            isPdfsOpen={isPdfsOpen}
            onTogglePdfs={() => setIsPdfsOpen((isOpen) => !isOpen)}
            pdfCount={pdfNotes.length}
            isStickyMode={isStickyMode}
            onToggleStickyMode={() => {
              setIsStickyMode((mode) => !mode);
              setIsBubbleMode(false);
              setIsGraphMode(false);
              setIsGraph2DMode(false);
            }}
            isBubbleMode={isBubbleMode}
            onToggleBubbleMode={() => {
              setIsBubbleMode((mode) => !mode);
              setIsStickyMode(false);
              setIsGraphMode(false);
              setIsGraph2DMode(false);
            }}
          />
          </div>
          {/* Positioned so the imported-PDFs popup can overlay exactly the tabs list and scratchpad. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
          <SidebarPacket
            title="Tabs"
            isFill
            actions={<CloseAllTabsButton isDisabled={cardTabItems.length <= 1} onConfirm={() => void animateCloseAll().then(closeAllTabs)} />}
          >
            <TabBar
              tabs={cardTabItems}
              activeTabId={activeTabId}
              vaultRoot={vaultRoot}
              onSelect={selectTab}
              onClose={closeTab}
              onToggleFlag={toggleFlag}
              onMoveToWorkspace={moveTabToWorkspace}
              onDuplicateToWorkspace={duplicateTabToWorkspace}
              onRevealInFinder={(tabId) => void revealItemInDir(tabId)}
              otherWorkspaces={workspaceNames.filter((name) => name !== currentWorkspace)}
              onReorder={reorderTabs}
              onNewNote={(path) => void createNote(path)}
              onNewCanvas={(path) => void createCanvas(path)}
              onImportPdf={(path) => void importPdfs(path)}
              onNewSubfolder={(path) => void handleCreateFolderAt(path)}
              onRenameFolder={(folderPath, newName) => void handleRenameFolder(folderPath, newName)}
              folderPaths={folderPaths}
              allNotes={treeAllNotes}
              onOpenNote={openRelativePath}
              // Run the scroll container out to the panel's edge (packet's
              // px-1.5 + panel's px-2 = 14px) so its scrollbar sits flush; the
              // padding is less than that, so cards sit closer to the
              // scrollbar than the panel padding alone would put them.
              // Its scrollbar would show beside the imported-PDFs popup that covers it.
              className={`sidebar-scroll -mr-3.5 min-h-0 flex-1 pr-2.5 ${isPdfsOpen ? '!overflow-y-hidden' : ''}`}
            />
          </SidebarPacket>
          <WorkspaceScratchpad value={scratchpad} onChange={setScratchpad} />
          <AnimatePresence>
          {isPdfsOpen && (
            <motion.div
              key="imported-pdfs"
              // Same open/close timing as ContextMenu.tsx: eases out in, a touch quicker out.
              initial={{ opacity: 0, y: -8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, y: -6, scale: 0.985, transition: { duration: 0.1, ease: 'easeIn' } }}
              style={{ transformOrigin: 'top center' }}
              className="absolute inset-0 z-20 flex flex-col rounded-panel bg-bg-panel shadow-[var(--shadow-float)]"
            >
              <SidebarPacket
                title="Imported PDFs"
                isFill
                actions={
                  <>
                    <PacketIconButton title="import pdf" onClick={() => void importPdfs('')}>
                      <FilePdf size={15} />
                    </PacketIconButton>
                    <PacketIconButton title="close" onClick={() => setIsPdfsOpen(false)}>
                      <X size={14} />
                    </PacketIconButton>
                  </>
                }
              >
                <ImportedPdfsDock
                  pdfs={pdfNotes}
                  activePath={activeRelativePath}
                  onSelect={(path, source) => {
                    // Fly the card into its tab, captured before the popup starts fading.
                    if (source) flyCardToTab(source, `${vaultRoot}/${path}`);
                    setIsPdfsOpen(false);
                    openRelativePath(path);
                  }}
                />
              </SidebarPacket>
            </motion.div>
          )}
          </AnimatePresence>
          </div>
          {isPinnedOpen && (
            <SidebarPacket title="Pinned notes" isFill>
              <PinnedDock />
            </SidebarPacket>
          )}
        </Sidebar>
      }
      inspector={
        <Sidebar side="right" onResizeEnd={(px) => void setSidebarWidthRight(px)}>
          <RightPanelHeader />
          {/* Keyed by layer: switching remounts this wrapper, replaying the slide-in
              from the side of the tab that was picked (see .layer-enter). */}
          {activeRightLayer !== 'terminal' && (
            <div key={activeRightLayer} className="layer-enter flex min-h-0 flex-1 flex-col" style={layerEnterStyle}>
          {activeRightLayer === 'files' && (
            <SidebarPacket
              title="Vault"
              isFill
              actions={
                <>
                  <PacketIconButton title="new note" onClick={() => void createNote()}>
                    <FilePlus size={15} />
                  </PacketIconButton>
                  <PacketIconButton title="new canvas" onClick={() => void createCanvas()}>
                    <Stack size={15} />
                  </PacketIconButton>
                  <PacketIconButton title="import pdf" onClick={() => void importPdfs('')}>
                    <FilePdf size={15} />
                  </PacketIconButton>
                  <PacketIconButton
                    title="new folder"
                    onClick={() => {
                      setIsCreatingFolder(true);
                      setNewFolderName('');
                    }}
                  >
                    <FolderPlus size={15} />
                  </PacketIconButton>
                </>
              }
            >
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
                  className="mb-1 w-full rounded-row border border-border bg-transparent px-2 py-1 text-left text-fg-prominent outline-none focus:border-border-strong"
                  style={{ fontSize: '0.8rem' }}
                />
              )}
              <FolderTree {...fileTreeProps} />
            </SidebarPacket>
          )}
          {activeRightLayer === 'browser' && (
            <SidebarPacket title="Browser" isFill>
              <FileBrowser {...fileTreeProps} />
            </SidebarPacket>
          )}
          {activeRightLayer === 'search' && (
            <SidebarPacket title="Search" isFill>
              <SearchPanel vaultRoot={vaultRoot} onSelect={openRelativePath} />
            </SidebarPacket>
          )}
          {activeRightLayer === 'contents' && <TocPanel activePath={activePath} />}
          {activeRightLayer === 'links' && (
            <>
              <BacklinksPanel vaultRoot={vaultRoot} noteId={(activePdf ? fusedNote : activeNote)?.id ?? null} onSelect={openRelativePath} />
              <UnresolvedLinksPanel vaultRoot={vaultRoot} onSelect={openRelativePath} onChanged={refreshNotes} />
              {/* Tags take the leftover height, but never shrink below a usable list
                  when the two link panels above are long. */}
              <div className="flex min-h-40 flex-1 flex-col">
                <SidebarPacket title="Tags" isFill>
                  <TagBrowser vaultRoot={vaultRoot} selectedTag={selectedTag} onSelectTag={setSelectedTag} />
                </SidebarPacket>
              </div>
            </>
          )}
            </div>
          )}
          {(hasOpenedTerminal || activeRightLayer === 'terminal') && (
            // Hidden↔shown restarts the CSS animation, so the terminal slides in too.
            <div
              className={activeRightLayer === 'terminal' ? 'layer-enter flex min-h-0 flex-1 flex-col' : 'hidden'}
              style={layerEnterStyle}
            >
              <TerminalPane vaultRoot={vaultRoot} isActive={activeRightLayer === 'terminal'} />
            </div>
          )}
          {pendingDelete && (
            <ConfirmDialog
              message={
                pendingDelete.kind === 'note' && pendingDeleteFusedNote
                  ? `Delete the PDF "${pendingDelete.note.title}"? Keep its note as a standalone note?`
                  : pendingDelete.kind === 'note'
                  ? `Delete "${pendingDelete.note.title}" forever? This can't be undone.`
                  : isTrashFolder(pendingDelete.path)
                  ? 'Empty the Trash? Everything in it is deleted forever.'
                  : `Delete "${pendingDelete.path.split('/').pop()}" and everything inside it? This can't be undone.`
              }
              confirmLabel={pendingDeleteFusedNote ? 'delete both' : pendingDelete.kind === 'folder' && isTrashFolder(pendingDelete.path) ? 'empty trash' : 'delete forever'}
              alternate={
                pendingDelete.kind === 'note' && pendingDeleteFusedNote
                  ? {
                      label: 'keep note',
                      onSelect: () => {
                        void deleteNote(pendingDelete.note, true);
                        setPendingDelete(null);
                      },
                    }
                  : undefined
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
              className={`${renameStatus.isError ? 'text-accent-link-broken' : 'text-fg-faint'}`}
              style={{ fontSize: '0.68rem' }}
            >
              [{renameStatus.message}]
            </span>
          )}
        </Sidebar>
      }
      statusBar={
        <StatusBar
          vaultRoot={vaultRoot}
          noteCount={allNotes?.length ?? 0}
          unresolvedCount={unresolvedCount}
          activeNoteStats={tabStats.get(activeTabId) ?? null}
          isReadingMode={isReadingMode}
          onToggleReadingMode={() => setIsReadingMode((mode) => !mode)}
        />
      }
    >
      <div className="relative flex h-full flex-col overflow-hidden">
        <div ref={contentRef} className="min-h-0 flex-1">
          {isGraphMode ? (
            <GraphPanel
              vaultRoot={vaultRoot}
              activePath={activeRelativePath}
              onSelect={(path) => {
                openRelativePath(path);
                setIsGraphMode(false);
              }}
            />
          ) : isGraph2DMode ? (
            <Graph2DPanel
              vaultRoot={vaultRoot}
              activePath={activeRelativePath}
              onSelect={(path) => {
                openRelativePath(path);
                setIsGraph2DMode(false);
              }}
            />
          ) : isStickyMode ? (
            <StickyBoard />
          ) : isBubbleMode ? (
            <BubbleNavigatorView
              notes={treeAllNotes}
              folderPaths={folderPaths}
              onSelectNote={(path, source) => {
                // Fly the bubble into its tab before the view switches away.
                flyCardToTab(source, `${vaultRoot}/${path}`);
                openRelativePath(path);
              }}
              onNewNote={(folderPath) => void createNote(folderPath || undefined)}
              onNewCanvas={(folderPath) => void createCanvas(folderPath || undefined)}
              onImportPdf={(folderPath) => void importPdfs(folderPath)}
              onCreateFolder={(relativePath) => void handleCreateFolderAt(relativePath)}
              onRevealInFinder={(folderPath) => void revealFolder(folderPath)}
              onRenameFolder={(folderPath, newName) => void handleRenameFolder(folderPath, newName)}
              onMoveNote={(note, targetFolderPath) => void handleMoveNote(note, targetFolderPath)}
              onMoveFolder={(folderPath, targetParentPath) => void handleMoveFolder(folderPath, targetParentPath)}
            />
          ) : activePath && isPdfPath(activePath) ? (
            <PdfView
              pdfPath={activePath}
              hasNote={fusedNote !== null}
              vaultRoot={vaultRoot}
              onNavigate={openRelativePath}
              onRenameTitle={renameActiveNote}
              onAddNote={(content) => activePdf && void addNoteToPdf(activePdf, content)}
              readOnly={isReadingMode}
            />
          ) : activePath && activeNote?.isCanvas ? (
            <CanvasView key={activePath} path={activePath} vaultRoot={vaultRoot} onNavigate={openRelativePath} onSynced={refreshNotes} />
          ) : activePath && activeNote?.isHub && forceEditPath !== activePath ? (
            <HubView
              key={activePath}
              note={activeNote}
              vaultRoot={vaultRoot}
              onNavigate={openRelativePath}
              onEditSource={() => setForceEditPath(activePath)}
            />
          ) : activePath ? (
            <div className="flex h-full flex-col">
              {activeNote?.isHub && (
                <div className="flex shrink-0 items-center justify-end border-b border-b-border-subtle px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setForceEditPath(null)}
                    className="text-fg-faint hover:text-fg-prominent"
                    style={{ fontSize: '0.75rem' }}
                  >
                    [back to hub view]
                  </button>
                </div>
              )}
              <div className="min-h-0 flex-1">
                <Editor
                  key={activePath}
                  path={activePath}
                  vaultRoot={vaultRoot}
                  onNavigate={openRelativePath}
                  onRenameTitle={renameActiveNote}
                  readOnly={isReadingMode}
                />
              </div>
            </div>
          ) : (
            <HomeDashboard
              vaultRoot={vaultRoot}
              noteCount={allNotes?.length ?? 0}
              unresolvedCount={unresolvedCount}
              onSelect={openRelativePath}
              onSelectTag={openTagFromDashboard}
              onNewNote={() => void createNote()}
              onNewCanvas={() => void createCanvas()}
              onImportPdf={() => void importPdfs('')}
              onOpenStickyBoard={() => setIsStickyMode(true)}
              workspaceNames={workspaceNames}
              currentWorkspace={currentWorkspace}
              workspaceColors={workspaceColors}
              onSwitchWorkspace={switchWorkspace}
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
  const initPanelLayout = usePanelLayoutStore((state) => state.initFromConfig);
  const toggleSidebar = usePanelLayoutStore((state) => state.toggleSidebar);

  // Workspaces own the tab state and its commands; VaultReady gets them as props.
  const workspaces = useWorkspaces(vaultRoot);
  const { tabs } = workspaces;

  useEffect(() => {
    void initFromConfig();
    void initSettings();
    initPanelLayout().catch((error: unknown) => {
      console.error('Failed to restore panel layout', error);
    });
  }, [initFromConfig, initSettings, initPanelLayout]);

  // Cmd+B toggles the left panel, Cmd+Opt+B the right. Matched on `code`, not
  // `key`: Option+B types a different character on macOS.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.metaKey || event.code !== 'KeyB') return;
      event.preventDefault();
      toggleSidebar(event.altKey ? 'right' : 'left');
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  const tabItems: TabItem[] = tabs.map((id) => ({
    id,
    label: id === HOME_TAB_ID ? 'Home' : titleFromPath(id),
    kind: id === HOME_TAB_ID ? 'home' : id.endsWith(CANVAS_EXTENSION) ? 'canvas' : isPdfPath(id) ? 'pdf' : 'note',
    closable: id !== HOME_TAB_ID,
    isFlagged: workspaces.flaggedTabs.includes(id),
  }));

  return (
    <div className="flex h-full flex-col">
      <WindowChrome />
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
            activeTabId={workspaces.activeTabId}
            pendingActiveId={workspaces.pendingActiveId}
            onPendingActiveApplied={workspaces.clearPendingActive}
            tabItems={tabItems}
            setActiveTabId={workspaces.setActiveTabId}
            openAbsolutePath={workspaces.openAbsolutePath}
            closeTab={workspaces.closeTab}
            closeAllTabs={workspaces.closeAllTabs}
            toggleFlag={workspaces.toggleFlag}
            moveTabToWorkspace={workspaces.moveTabToWorkspace}
            duplicateTabToWorkspace={workspaces.duplicateTabToWorkspace}
            renameTabId={workspaces.renameTabId}
            remapTabsUnderFolder={workspaces.remapTabsUnderFolder}
            removeTabsEverywhere={workspaces.removeTabsEverywhere}
            reorderTabs={workspaces.reorderTabs}
            workspaceNames={workspaces.workspaceNames}
            currentWorkspace={workspaces.currentWorkspace}
            stepWorkspace={workspaces.stepWorkspace}
            scratchpad={workspaces.scratchpad}
            setScratchpad={workspaces.setScratchpad}
            workspaceColors={workspaces.workspaceColors}
            setWorkspaceColor={workspaces.setWorkspaceColor}
            switchWorkspace={workspaces.switchWorkspace}
            renameWorkspace={workspaces.renameWorkspace}
            createWorkspace={workspaces.createWorkspace}
            deleteWorkspace={workspaces.deleteWorkspace}
          />
        )}
      </div>
      <TerminalLauncher
        focusedTarget={
          workspaces.activeTabId === HOME_TAB_ID ? null : agentTargetFromPath(workspaces.activeTabId, false)
        }
      />
      <AgentStopConfirm />
    </div>
  );
}

export default App;
