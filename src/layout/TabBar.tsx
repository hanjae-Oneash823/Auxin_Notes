import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CaretRight, FileText, FilePlus, FolderPlus, House, Plus, Stack, SquaresFour, X, type Icon } from '@phosphor-icons/react';
import { formatCount, formatRelativeTime, type NoteStats } from '../notes/noteStats';
import { getDb } from '../db/client';
import { getCollapsedTabGroups, setCollapsedTabGroups } from '../db/queries/folderState';
import type { NoteSummary } from '../db/queries/notes';
import { toRelativePath } from '../vault/syncEngine';
import { uniqueFolderName } from '../vault/folderEngine';
import { usePanelLayoutStore } from './panelLayoutStore';
import { buildTabGroupTree, groupNotesByFolder, type TabGroupNode } from './tabGroups';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { Pill } from './Pill';
import { PacketIconButton } from './SidebarPacket';
import { animateTabClose } from './tabCloseAnimation';
import { reorderIds } from './tabOrder';
import { trackGlow } from './trackGlow';

/** The pinned, non-closable first tab — always present, id is a fixed
 *  sentinel rather than a note path. Exported so App.tsx (which owns tab
 *  state) and this file (which needs to style it distinctly) agree on it. */
export const HOME_TAB_ID = 'home';

export type TabKind = 'home' | 'note' | 'hub' | 'canvas';

export interface TabItem {
  id: string;
  label: string;
  kind: TabKind;
  closable: boolean;
  /** Folder the note lives in ("A / B", or "Vault" at the root). */
  folder?: string | null;
  /** Raw vault-relative directory ("A/B", "" at the root) — unlike `folder`
   *  above, this is what TabBar groups tabs by, not a display label. */
  folderPath?: string | null;
  /** ISO timestamp of the note's last modification. */
  modified?: string | null;
  /** Word/image counts; absent for canvases and until first computed. */
  stats?: NoteStats | null;
}

const TAB_ICONS: Record<TabKind, Icon> = {
  home: House,
  note: FileText,
  hub: SquaresFour,
  canvas: Stack,
};

/** Left inset of a card's detail lines: icon width (15) + gap (8), so they
 *  line up under the title rather than under the icon. */
const DETAIL_INDENT_CLASS = 'pl-[23px]';

/** Titles wrap to at most two lines, then end in an ellipsis; a short title
 *  just takes one line (line-clamp only kicks in on overflow). The 1.4
 *  line-height keeps the icon/close button aligned to the first line. */
const TITLE_MAX_LINES = 2;
const TITLE_CLAMP_STYLE = {
  fontSize: '0.85rem',
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: TITLE_MAX_LINES,
  overflow: 'hidden',
} as const;

/** "842 words · 3 images · 5m" — parts that don't apply are left out. */
function buildMetaLine(tab: TabItem): string {
  const parts: string[] = [];
  if (tab.stats) {
    parts.push(`${formatCount(tab.stats.words)} ${tab.stats.words === 1 ? 'word' : 'words'}`);
    if (tab.stats.images > 0) parts.push(`${tab.stats.images} ${tab.stats.images === 1 ? 'image' : 'images'}`);
  }
  const age = tab.modified ? formatRelativeTime(tab.modified) : '';
  if (age) parts.push(age);
  return parts.join(' · ');
}

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string;
  /** Which vault's collapsed-tab-group state to load/persist — tabs are
   *  grouped into per-folder sections (see tabGroups.ts), each collapsible
   *  and independently persisted from FolderTree's own collapsed folders. */
  vaultRoot: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  /** Reorders tabs by dragging — moves `draggedId` next to `targetId`,
   *  after it when `placeAfter` is true. Scoped to siblings within the same
   *  folder group (see resolveHoverTarget) — dragging into a different
   *  group would mean moving the underlying file, which is out of scope
   *  here. Omitted where drag-to-reorder isn't wired up. */
  onReorder?: (draggedId: string, targetId: string, placeAfter: boolean) => void;
  /** Folder-group header actions — `onNewNote`/`onNewCanvas` receive that
   *  group's relative path ("" for the vault root, though the root bucket
   *  renders no header). `onNewSubfolder` differs: TabBar picks the new
   *  folder's full collision-free path itself (see `handleNewSubfolder`,
   *  same as FolderTree.tsx's own `handleNewFolderHere`) and hands that
   *  over already-built, so this just creates it at that exact path. */
  onNewNote: (folderPath: string) => void;
  onNewCanvas: (folderPath: string) => void;
  onNewSubfolder: (relativePath: string) => void;
  /** Commits the inline rename box a new subfolder drops into (see
   *  `pendingNewFolder`) — same handler FolderTree.tsx's own folder rename
   *  uses. */
  onRenameFolder: (folderPath: string, newName: string) => void;
  /** Every folder path in the vault — needed to pick a collision-free name
   *  for a new subfolder (`uniqueFolderName`), the same way FolderTree.tsx
   *  already does for its own "new folder here". */
  folderPaths: string[];
  /** Every note in the vault, open or not — used to offer the other notes
   *  sharing a folder with an already-open tab (see `groupNotesByFolder`). */
  allNotes: NoteSummary[];
  /** Opens a note (vault-relative path) as a new tab — wired to the "N more
   *  in this folder" list below each group's own tabs. */
  onOpenNote: (relativePath: string) => void;
  className?: string;
}

/** Same indent step as FolderTree.tsx's own nested-folder rendering. */
const GROUP_INDENT_PX = 14;

/** "N more in this folder" hover grace periods — same open delay as
 *  HoverTooltip.tsx's TOOLTIP_DELAY_MS. The close delay is longer than a
 *  plain tooltip's needs to be: it has to cover the pointer's travel time
 *  from the trigger down to the popup itself. */
const MORE_NOTES_OPEN_DELAY_MS = 150;
const MORE_NOTES_CLOSE_DELAY_MS = 250;

/** Pixels of pointer movement before a mousedown counts as a drag rather
 *  than a click. Below this, releasing still selects the tab as normal. */
const DRAG_THRESHOLD_PX = 4;

/** How long the FLIP slide takes when a tab's position changes because
 *  another tab is being dragged past it, and the curve it eases along —
 *  reusing the app's own `--ease-panel` token (the same curve the tab's
 *  hover/active color transition already uses) instead of a generic linear
 *  `ease`, so the slide reads as part of the same motion language. */
const REORDER_ANIMATION_MS = 220;
const REORDER_ANIMATION_EASE = 'var(--ease-panel)';

/** Marks the document while the window is unfocused so the idle glow drift
 *  (`.tab-glow::after`, global.css) can pause instead of animating unseen. */
function useWindowBlurFlag(): void {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      if (document.hasFocus()) root.removeAttribute('data-window-blurred');
      else root.setAttribute('data-window-blurred', '');
    };
    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      root.removeAttribute('data-window-blurred');
    };
  }, []);
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  moved: boolean;
}

interface HoverTarget {
  id: string;
  placeAfter: boolean;
}

function sameTarget(a: HoverTarget | null, b: HoverTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.placeAfter === b.placeAfter;
}

/** Vertical tab list for the left sidebar (Arc-style): one row per open tab,
 *  the pinned Home tab first. The list has no chrome of its own — the
 *  sidebar packet around it provides the card.
 *
 *  Reordering is done with manual pointer tracking rather than the native
 *  HTML5 Drag and Drop API — `dragstart`/`drop` don't fire reliably for
 *  internal element reordering inside Tauri's macOS WKWebView. The drop
 *  target is resolved from tab geometry (each candidate's bounding rect)
 *  rather than `elementFromPoint`, so dragging past the last tab into the
 *  empty space below it still resolves to "after the last tab" instead of
 *  hitting nothing.
 *
 *  While dragging, tabs render in their live preview order (via
 *  `reorderIds`, the same helper `App.tsx` uses to commit the drop) so the
 *  rest of the list visibly slides out of the way in real time. The slide
 *  itself is a manual FLIP: `useLayoutEffect` compares each tab's position
 *  before/after the preview order changes and animates the delta away with
 *  a transform, since a plain array reorder alone just snaps elements to
 *  their new position with no transition. */
export function TabBar({
  tabs,
  activeTabId,
  vaultRoot,
  onSelect,
  onClose,
  onReorder,
  onNewNote,
  onNewCanvas,
  onNewSubfolder,
  onRenameFolder,
  folderPaths,
  allNotes,
  onOpenNote,
  className,
}: TabBarProps) {
  useWindowBlurFlag();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The close animation delays `onClose` by ~0.3s. Calling it through a ref
  // means it runs with the *latest* handler — App's closeTab builds the next
  // tab list from state, so a handler captured at click time would resurrect
  // any tab closed (or opened) in between.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // WKWebView (Tauri's macOS webview) sometimes leaves a tab card's title
  // unpainted — box laid out at the right size, but the `-webkit-line-clamp`
  // text (TITLE_CLAMP_STYLE) inside never redraws — after this sidebar goes
  // from hidden back to visible. Hovering a card fixes it immediately
  // (its own `:hover` style recalculation forces WebKit to repaint that
  // specific row), which is the clue this needs a per-row nudge, not a
  // reflow on some distant ancestor: once the show animation settles, this
  // forces the same kind of repaint hover would, directly on every row.
  const isLeftSidebarOpen = usePanelLayoutStore((state) => state.isLeftSidebarOpen);
  const isSidebarToggling = usePanelLayoutStore((state) => state.isToggling);
  useEffect(() => {
    if (!isLeftSidebarOpen || isSidebarToggling) return;
    const rows = containerRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]');
    if (!rows) return;
    for (const row of rows) {
      row.style.display = 'none';
      void row.offsetHeight;
      row.style.display = '';
    }
  }, [isLeftSidebarOpen, isSidebarToggling]);
  const dragState = useRef<DragState | null>(null);
  const hoverTargetRef = useRef<HoverTarget | null>(null);
  const suppressClickRef = useRef(false);
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const prevOrderKeyRef = useRef<string | null>(null);

  // Same load-then-save pattern as FolderTree.tsx's collapsed-folder state
  // (:189-207) — a separate persisted key (collapsed_tab_groups), since this
  // is the open-tabs working-set view, not the vault-wide folder browser.
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const loadedForVaultRootRef = useRef<string | null>(null);

  useEffect(() => {
    loadedForVaultRootRef.current = null;
    let cancelled = false;
    void (async () => {
      const db = await getDb(vaultRoot);
      const paths = await getCollapsedTabGroups(db);
      if (cancelled) return;
      setCollapsedPaths(new Set(paths));
      loadedForVaultRootRef.current = vaultRoot;
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultRoot]);

  useEffect(() => {
    if (loadedForVaultRootRef.current !== vaultRoot) return;
    void getDb(vaultRoot).then((db) => setCollapsedTabGroups(db, [...collapsedPaths]));
  }, [vaultRoot, collapsedPaths]);

  function toggleCollapsed(path: string) {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  // A new subfolder drops straight into an inline rename box — same
  // "create then let the user retype the name" flow FolderTree.tsx's own
  // handleNewFolderHere gives. Unlike FolderTree, a brand-new empty
  // subfolder has no open tabs, so buildTabGroupTree would never give it a
  // row of its own to attach a rename box to — this renders a synthetic one
  // instead (see the `pendingNewFolder` check in renderGroupChildren), gone
  // as soon as it's committed or cancelled since the folder still won't
  // have a real row afterward.
  const [pendingNewFolder, setPendingNewFolder] = useState<{ parentPath: string; path: string; value: string } | null>(
    null,
  );

  function handleNewSubfolder(parentPath: string) {
    const name = uniqueFolderName(folderPaths, parentPath);
    const path = parentPath ? `${parentPath}/${name}` : name;
    onNewSubfolder(path);
    setPendingNewFolder({ parentPath, path, value: name });
  }

  function commitPendingNewFolder() {
    if (!pendingNewFolder) return;
    const { path, value } = pendingNewFolder;
    const name = value.trim();
    setPendingNewFolder(null);
    if (!name || name === path.split('/').pop()) return;
    onRenameFolder(path, name);
  }

  // "N more in this folder" popup — at most one open at a time, anchored
  // just under whichever trigger it opened from. Hover-driven rather than
  // click-driven, so it needs its own open/close grace timers (same idea as
  // HoverTooltip.tsx's TOOLTIP_DELAY_MS): opening waits a beat so passing
  // over the trigger doesn't flash it, and closing waits a beat so crossing
  // the gap from the trigger down onto the popup itself — a separate,
  // fixed-position element the pointer briefly leaves both of — doesn't
  // dismiss it before the pointer arrives. Ephemeral state (not persisted
  // like collapsedPaths above), since it's just a browsing aid, not
  // workspace structure.
  const [moreNotesPopup, setMoreNotesPopup] = useState<{ folderPath: string; x: number; y: number } | null>(null);
  const moreNotesOpenTimerRef = useRef<number | null>(null);
  const moreNotesCloseTimerRef = useRef<number | null>(null);

  function clearMoreNotesOpenTimer() {
    if (moreNotesOpenTimerRef.current === null) return;
    window.clearTimeout(moreNotesOpenTimerRef.current);
    moreNotesOpenTimerRef.current = null;
  }

  function clearMoreNotesCloseTimer() {
    if (moreNotesCloseTimerRef.current === null) return;
    window.clearTimeout(moreNotesCloseTimerRef.current);
    moreNotesCloseTimerRef.current = null;
  }

  function scheduleMoreNotesClose() {
    clearMoreNotesCloseTimer();
    moreNotesCloseTimerRef.current = window.setTimeout(() => setMoreNotesPopup(null), MORE_NOTES_CLOSE_DELAY_MS);
  }

  useEffect(
    () => () => {
      clearMoreNotesOpenTimer();
      clearMoreNotesCloseTimer();
    },
    [],
  );

  const notesByFolder = useMemo(() => groupNotesByFolder(allNotes), [allNotes]);
  const openNotePaths = useMemo(
    () => new Set(tabs.filter((tab) => tab.id !== HOME_TAB_ID).map((tab) => toRelativePath(vaultRoot, tab.id))),
    [tabs, vaultRoot],
  );

  /** Direct subfolders of `folderPath`, alphabetical. */
  function childFolders(folderPath: string): string[] {
    const prefix = `${folderPath}/`;
    return folderPaths
      .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .sort((a, b) => a.localeCompare(b));
  }

  /** Notes in `folderPath` and everything nested inside it. */
  function countNotesUnder(folderPath: string): number {
    const prefix = `${folderPath}/`;
    let count = 0;
    for (const [path, notes] of notesByFolder) {
      if (path === folderPath || path.startsWith(prefix)) count += notes.length;
    }
    return count;
  }

  /** What the "N more in this folder" row counts: the folder's notes that
   *  aren't open as tabs, plus its direct subfolders. */
  function countMoreItems(folderPath: string): number {
    const closedNotes = (notesByFolder.get(folderPath) ?? []).filter((note) => !openNotePaths.has(note.path));
    return closedNotes.length + childFolders(folderPath).length;
  }

  /** The popup's tree for a folder: subfolders first (each a submenu of its
   *  own contents, recursively, with a note-count badge), then its notes.
   *  The top level lists only notes that aren't already open as tabs — the
   *  point of "N more" — while a subfolder's flyout lists every note in it,
   *  since it's a browser for that folder rather than a remainder. */
  function buildFolderMenuItems(folderPath: string, onlyClosedNotes: boolean): ContextMenuItem[] {
    const subfolders: ContextMenuItem[] = childFolders(folderPath).map((path) => ({
      label: path.slice(path.lastIndexOf('/') + 1),
      badge: countNotesUnder(path),
      submenu: buildFolderMenuItems(path, false),
    }));
    const notes: ContextMenuItem[] = (notesByFolder.get(folderPath) ?? [])
      .filter((note) => !onlyClosedNotes || !openNotePaths.has(note.path))
      .map((note) => ({ label: note.title, onSelect: () => onOpenNote(note.path) }));
    const items = [...subfolders, ...notes];
    return items.length > 0 || onlyClosedNotes ? items : [{ label: 'empty', disabled: true }];
  }

  const displayTabs =
    draggedId && hoverTarget
      ? reorderIds(
          tabs.map((tab) => tab.id),
          draggedId,
          hoverTarget.id,
          hoverTarget.placeAfter,
        )
          .map((id) => tabs.find((tab) => tab.id === id))
          .filter((tab): tab is TabItem => tab !== undefined)
      : tabs;

  const orderKey = displayTabs.map((tab) => tab.id).join('\n');
  const groupTree = buildTabGroupTree(displayTabs);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const elements = Array.from(container.querySelectorAll<HTMLElement>('[data-tab-id]'));

    // Only a change to the tab list/order should play the slide below. This
    // effect runs on every render, and the list also re-renders for
    // unrelated reasons (e.g. the sidebar show/hide animation) — treating a
    // layout shift as a reorder would slide every tab back from its stale
    // earlier position, a visible jump. For those renders just refresh the
    // resting positions (skipped while a slide is mid-flight, when the
    // painted rects include its transform).
    const isOrderChange = prevOrderKeyRef.current !== orderKey;
    prevOrderKeyRef.current = orderKey;
    if (!isOrderChange) {
      const isSliding = elements.some((el) => el.style.transform !== '' && el.style.transform !== 'none');
      if (isSliding) return;
      const restingRects = new Map<string, DOMRect>();
      for (const el of elements) {
        const id = el.dataset.tabId;
        if (id) restingRects.set(id, el.getBoundingClientRect());
      }
      prevRectsRef.current = restingRects;
      return;
    }

    // `getBoundingClientRect()` reports the element's current *painted*
    // box, transform included — so if a previous slide is still mid-flight
    // when a new reorder comes in, measuring now would capture an
    // interpolated, still-moving position instead of the resting layout
    // position. Cancelling any in-flight transform/transition first and
    // forcing a reflow guarantees every measurement below is the true,
    // untransformed layout position, which is what the FLIP diff needs to
    // stay correct across back-to-back reorders during a fast drag.
    for (const el of elements) {
      el.style.transition = 'none';
      el.style.transform = 'none';
    }
    void container.offsetWidth;

    const prevRects = prevRectsRef.current;
    const nextRects = new Map<string, DOMRect>();
    for (const el of elements) {
      const id = el.dataset.tabId;
      if (id) nextRects.set(id, el.getBoundingClientRect());
    }

    // Invert: jump each moved tab back to where it visually was, still with
    // transitions off, then force one more reflow so that jump actually
    // applies before we animate away from it.
    for (const el of elements) {
      const id = el.dataset.tabId;
      if (!id) continue;
      const prevRect = prevRects.get(id);
      const nextRect = nextRects.get(id);
      if (!prevRect || !nextRect) continue;
      const dy = prevRect.top - nextRect.top;
      if (dy !== 0) el.style.transform = `translateY(${dy}px)`;
    }
    void container.offsetWidth;

    // Play: transition every moved tab back to its resting position. The
    // inline `transition` is cleared once the slide finishes so it doesn't
    // linger and shadow the tab's own `transition-colors` class afterward.
    for (const el of elements) {
      const id = el.dataset.tabId;
      if (!id) continue;
      const prevRect = prevRects.get(id);
      const nextRect = nextRects.get(id);
      if (!prevRect || !nextRect || prevRect.top === nextRect.top) continue;

      el.style.transition = `transform ${REORDER_ANIMATION_MS}ms ${REORDER_ANIMATION_EASE}`;
      el.style.transform = '';
      const clearTransition = (event: TransitionEvent) => {
        if (event.propertyName !== 'transform') return;
        el.style.transition = '';
        el.removeEventListener('transitionend', clearTransition);
      };
      el.addEventListener('transitionend', clearTransition);
    }

    prevRectsRef.current = nextRects;
  });

  function resolveHoverTarget(pointerY: number, draggedTabId: string, draggedParentPath: string): HoverTarget | null {
    const container = containerRef.current;
    if (!container) return null;

    // Scoped to the dragged tab's own folder group (same parentPath) — a
    // tab dragged near a different group's rows still only ever resolves to
    // a position within its own group, since those rows are filtered out as
    // candidates entirely. Moving a tab into a different group would mean
    // moving the underlying file, which this doesn't attempt.
    const candidates = Array.from(container.querySelectorAll<HTMLElement>('[data-tab-id]')).filter(
      (el) =>
        el.dataset.tabId !== HOME_TAB_ID &&
        el.dataset.tabId !== draggedTabId &&
        el.dataset.parentPath === draggedParentPath,
    );
    if (candidates.length === 0) return null;

    // A single consistent midpoint test, top to bottom: the first candidate
    // the pointer hasn't reached the middle of yet is the target ("before"
    // it). This must be the only test — an unconditional edge check running
    // alongside it clobbers the midpoint result on later iterations, making
    // drags in one direction need an extra row of travel to register.
    for (const el of candidates) {
      const id = el.dataset.tabId;
      if (!id) continue;
      const rect = el.getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) {
        return { id, placeAfter: false };
      }
    }

    const lastId = candidates[candidates.length - 1].dataset.tabId;
    return lastId ? { id: lastId, placeAfter: true } : null;
  }

  function handleMouseDown(tabId: string, parentPath: string, event: React.MouseEvent) {
    if (event.button !== 0) return;
    dragState.current = { id: tabId, startX: event.clientX, startY: event.clientY, moved: false };
    const draggedParentPath = parentPath;

    function handleMouseMove(moveEvent: MouseEvent) {
      const state = dragState.current;
      if (!state) return;

      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        state.moved = true;
        setDraggedId(state.id);
        // The FLIP transform below still counts toward this container's
        // scrollable overflow area even though it doesn't change layout, so
        // a reorder mid-drag can otherwise pop a scrollbar and shove the
        // scroll position, making tabs appear to vanish. Scrolling isn't
        // needed mid-drag anyway, so just suspend it for the duration.
        if (containerRef.current) containerRef.current.style.overflowY = 'hidden';
      }
      if (!state.moved) return;

      const nextTarget = resolveHoverTarget(moveEvent.clientY, state.id, draggedParentPath);
      if (sameTarget(hoverTargetRef.current, nextTarget)) return;
      hoverTargetRef.current = nextTarget;
      setHoverTarget(nextTarget);
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const state = dragState.current;
      const target = hoverTargetRef.current;
      dragState.current = null;
      hoverTargetRef.current = null;
      setDraggedId(null);
      setHoverTarget(null);
      if (containerRef.current) containerRef.current.style.overflowY = '';

      if (state?.moved) {
        suppressClickRef.current = true;
        if (target && target.id !== state.id) onReorder?.(state.id, target.id, target.placeAfter);
      }
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  /** Re-baselines the reorder FLIP (the `useLayoutEffect` above) to where the
   *  tabs are painted right now. The close animation (tabCloseAnimation.ts)
   *  has already moved every tab below the closed one to its final position
   *  through real layout changes; without this, the FLIP effect — which only
   *  remembers positions from before the collapse — would read the removal as
   *  a huge move, snap those tabs back down and slide them up a second time. */
  function syncReorderBaseline() {
    const container = containerRef.current;
    if (!container) return;
    const restingRects = new Map<string, DOMRect>();
    container.querySelectorAll<HTMLElement>('[data-tab-id]:not([data-closing])').forEach((el) => {
      const id = el.dataset.tabId;
      if (id) restingRects.set(id, el.getBoundingClientRect());
    });
    prevRectsRef.current = restingRects;
  }

  function handleClick(tabId: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(tabId);
  }

  function renderTab(tab: TabItem, parentPath: string, depth: number) {
    const isActive = tab.id === activeTabId;
    const isHome = tab.id === HOME_TAB_ID;
    const TabIcon = TAB_ICONS[tab.kind];
    const metaLine = buildMetaLine(tab);
    return (
      <div
        key={tab.id}
        data-tab-id={tab.id}
        data-active={isActive || undefined}
        data-parent-path={parentPath}
        onMouseDown={isHome ? undefined : (event) => handleMouseDown(tab.id, parentPath, event)}
        onClick={() => handleClick(tab.id)}
        onMouseMove={isActive ? trackGlow : undefined}
        className={`tab-card group flex shrink-0 cursor-pointer select-none flex-col gap-0.5 rounded-tab border px-2.5 py-2 transition-colors duration-panel ease-panel ${
          draggedId === tab.id ? 'opacity-40' : ''
        } ${
          isActive
            ? 'tab-glow border-[color:var(--border-strong)] bg-bg-packet-active text-fg shadow-[var(--shadow-float)]'
            : `border-transparent text-fg-muted hover:text-fg-prominent ${isHome ? '' : 'bg-bg-packet-card'}`
        }`}
      >
        <div className="flex items-start gap-2">
          <TabIcon size={15} className={`mt-[3px] shrink-0 ${isHome ? 'text-yellow-400' : ''}`} />
          <span className="min-w-0 flex-1 break-words font-medium" style={TITLE_CLAMP_STYLE}>
            {tab.label}
          </span>
          {tab.kind === 'hub' && <Pill>hub</Pill>}
          {tab.closable && (
            <button
              type="button"
              aria-label={`Close ${tab.label}`}
              onClick={(event) => {
                event.stopPropagation();
                const card = event.currentTarget.closest<HTMLElement>('[data-tab-id]');
                const close = () => {
                  syncReorderBaseline();
                  onCloseRef.current(tab.id);
                };
                if (card) animateTabClose(card, close);
                else close();
              }}
              className={`tab-close flex h-5 w-5 shrink-0 items-center justify-center rounded-row text-fg-faint transition-opacity hover:bg-border-default hover:text-fg-prominent group-hover:opacity-100 ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <X size={11} weight="bold" />
            </button>
          )}
        </div>
        {/* Only shown for the ungrouped root bucket (depth 0) — once a tab
         *  sits under a group header naming its folder, repeating the
         *  folder name on the card itself would be redundant. */}
        {depth === 0 && tab.folder && (
          <span className={`truncate text-fg-faint ${DETAIL_INDENT_CLASS}`} style={{ fontSize: '0.72rem' }}>
            {tab.folder}
          </span>
        )}
        {metaLine && (
          <span className={`truncate text-fg-faint ${DETAIL_INDENT_CLASS}`} style={{ fontSize: '0.72rem' }}>
            {metaLine}
          </span>
        )}
      </div>
    );
  }

  function renderGroupHeader(node: TabGroupNode, isCollapsed: boolean) {
    return (
      <div className="group mt-1 flex shrink-0 items-center gap-1 rounded-row px-1 py-0 text-fg-faint">
        <button
          type="button"
          aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
          onClick={() => toggleCollapsed(node.path)}
          className="flex min-w-0 flex-1 items-center gap-1"
        >
          <CaretRight
            size={10}
            weight="bold"
            className={`shrink-0 transition-transform duration-panel ease-panel ${isCollapsed ? '' : 'rotate-90'}`}
          />
          <span className="min-w-0 flex-1 truncate text-left font-semibold text-fg-prominent" style={{ fontSize: '0.85rem' }}>
            {node.name}
          </span>
        </button>
        {/* Single "+" trigger, opacity-revealed on header hover like the old
         *  three-button row. Hovering the trigger itself (the nested
         *  `group/add`) expands the three actions in place to its left — an
         *  inline flex reveal rather than an absolutely-positioned flyout, so
         *  it can't get clipped by the tab list's scroll container and needs
         *  no open/close state: the cursor never leaves `group/add`'s box
         *  moving from the "+" onto the revealed buttons, since they sit
         *  contiguous in the same row. */}
        <div className="group/add relative flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
          <div className="hidden items-center gap-0.5 group-hover/add:flex">
            <PacketIconButton title="New subfolder" onClick={() => handleNewSubfolder(node.path)}>
              <FolderPlus size={12} />
            </PacketIconButton>
            <PacketIconButton title="New note" onClick={() => onNewNote(node.path)}>
              <FilePlus size={12} />
            </PacketIconButton>
            <PacketIconButton title="New canvas" onClick={() => onNewCanvas(node.path)}>
              <Stack size={12} />
            </PacketIconButton>
          </div>
          <button
            type="button"
            aria-label="Add to this folder"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-row text-fg-faint transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
    );
  }

  /** The rest of a group's own notes — siblings of its open tabs that
   *  aren't themselves open. A plain text trigger, not a toggle: hovering it
   *  opens a `ContextMenu` anchored just under it (`moreNotesPopup` state,
   *  set below) rather than expanding inline, so it stays a compact one-line
   *  affordance regardless of how many notes it's hiding. */
  function renderMoreNotesRow(folderPath: string, count: number) {
    return (
      <button
        key={`${folderPath}::more`}
        type="button"
        aria-haspopup="menu"
        onMouseEnter={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          clearMoreNotesCloseTimer();
          clearMoreNotesOpenTimer();
          moreNotesOpenTimerRef.current = window.setTimeout(() => {
            setMoreNotesPopup({ folderPath, x: rect.left, y: rect.bottom + 2 });
          }, MORE_NOTES_OPEN_DELAY_MS);
        }}
        onMouseLeave={() => {
          clearMoreNotesOpenTimer();
          scheduleMoreNotesClose();
        }}
        className="-mt-0.5 self-start rounded-row px-1 py-0 text-left text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-muted"
        style={{ fontSize: '0.72rem' }}
      >
        {count} more in this folder
      </button>
    );
  }

  /** Renders a node's own tabs, then each child folder as a header plus —
   *  while expanded — a nested wrapper recursing into that folder's own
   *  children. The wrapper's `border-l` is what draws the filetree guide
   *  line: a real box's border naturally spans exactly its content's
   *  height and stops exactly where that content ends, no measurement
   *  needed. Indentation is likewise just accumulated DOM nesting (each
   *  level's margin/padding split evenly, see GROUP_INDENT_PX) rather than
   *  computed per-row depth math. The "N more" row (see above) only ever
   *  applies to an actual folder — the root bucket (`node.path === ''`)
   *  never has a header of its own, so there's nowhere for it to attach. */
  function renderGroupChildren(node: TabGroupNode, depth: number) {
    const moreCount = node.path ? countMoreItems(node.path) : 0;
    return (
      <>
        {moreCount > 0 && renderMoreNotesRow(node.path, moreCount)}
        {node.tabs.map((tab) => renderTab(tab, node.path, depth))}
        {node.folders.map((folder) => {
          const isCollapsed = collapsedPaths.has(folder.path);
          return (
            <div key={folder.path} data-folder-group={folder.path} className="flex flex-col gap-1">
              {renderGroupHeader(folder, isCollapsed)}
              {!isCollapsed && (
                <div
                  className="flex flex-col gap-1 border-l border-border-subtle"
                  style={{ marginLeft: GROUP_INDENT_PX / 2, paddingLeft: GROUP_INDENT_PX / 2 }}
                >
                  {renderGroupChildren(folder, depth + 1)}
                </div>
              )}
            </div>
          );
        })}
        {pendingNewFolder?.parentPath === node.path && (
          <input
            key="pending-new-folder"
            autoFocus
            value={pendingNewFolder.value}
            onChange={(event) =>
              setPendingNewFolder((current) => (current ? { ...current, value: event.target.value } : current))
            }
            onBlur={() => setPendingNewFolder(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitPendingNewFolder();
              if (event.key === 'Escape') setPendingNewFolder(null);
            }}
            className="rounded-row border border-border-strong bg-transparent px-1 py-0 text-left font-semibold text-fg-prominent outline-none"
            style={{ fontSize: '0.85rem' }}
          />
        )}
      </>
    );
  }

  // Recomputed from `moreNotesPopup.folderPath` at render time rather than
  // captured when the popup opened, so a note opened elsewhere while it's
  // still up (or the last one clicked from inside it) drops out live instead
  // of leaving a stale entry.
  const moreNotesPopupItems = moreNotesPopup ? buildFolderMenuItems(moreNotesPopup.folderPath, true) : [];

  return (
    <>
      <div
        ref={containerRef}
        data-tab-dragging={draggedId ? '' : undefined}
        className={`flex flex-col gap-1 overflow-y-auto ${className ?? ''}`}
      >
        {renderGroupChildren(groupTree, 0)}
      </div>
      {moreNotesPopup && moreNotesPopupItems.length > 0 && (
        <ContextMenu
          x={moreNotesPopup.x}
          y={moreNotesPopup.y}
          items={moreNotesPopupItems}
          onClose={() => setMoreNotesPopup(null)}
          onMouseEnter={clearMoreNotesCloseTimer}
          onMouseLeave={scheduleMoreNotesClose}
        />
      )}
    </>
  );
}
