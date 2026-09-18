import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getAppConfig } from '../app/appConfig';
import { getDb } from '../db/client';
import { listNotes, type NoteSummary } from '../db/queries/notes';
import { buildFolderTree, type FolderNode } from '../vault/folderTree';
import { filterAndRank } from './fileSearchFilter';
import {
  CHIP_GAP_PX,
  FileSearcherNode,
  itemName,
  NODE_SIZE_PX,
  NODE_SPACING_PX,
  NODE_TRANSITION,
  type FileSearcherItem,
} from './FileSearcherNode';
import { FileSearcherHeader } from './FileSearcherHeader';

/** Drives the level-transition slide (see the AnimatePresence below). Read
 *  as variant *functions* off `custom`, not as inline `direction ? a : b`
 *  values on the motion element itself — an exiting element's props are
 *  fixed as of the render where it was still current, so if `direction`
 *  were read inline there, an exit immediately following a transition in
 *  the opposite direction would animate using the *previous* transition's
 *  direction instead of this one. `custom` sidesteps that because it lives
 *  on `AnimatePresence` itself, which never unmounts, so it's always fresh
 *  at the render where the key actually changes — framer-motion's
 *  documented fix for exactly this staleness. */
const LEVEL_VARIANTS = {
  enter: (direction: 1 | -1) => ({ opacity: 0, x: direction === 1 ? 24 : -24 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: 1 | -1) => ({ opacity: 0, x: direction === 1 ? -24 : 24 }),
};

/** The whole panel's intro/outro. The window itself is transparent, so the
 *  `hidden` pose makes it fully invisible while still ordered in — the panel
 *  is only ordered out once the outro settles on it, and it's ordered back
 *  in still wearing it, so the intro always starts from nothing. The outro
 *  is quicker than the intro (--ease-snappy's duration vs. --duration-panel)
 *  so dismissing never feels like it's waiting on an animation. */
const PANEL_VARIANTS = {
  shown: { opacity: 1, scale: 1, y: 0, transition: NODE_TRANSITION },
  hidden: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.16, ease: 'easeIn' as const } },
};

/** How many carousel slots render on either side of the focused item — the
 *  rest of a large folder never touches the DOM. Items are keyed by
 *  identity (not slot), so framer-motion's `animate` smoothly slides each
 *  one between positions as focus moves, rather than swapping content in
 *  fixed slots. The outermost slot sits entirely inside LIST_MASK's clear
 *  band, so rows are mounted and unmounted there unseen, and fade in or out
 *  continuously as they slide through the mask on their way to or from it. */
const VISIBLE_RADIUS = 3;

/** Fades rows toward the list's top and bottom edges by fading the list
 *  container's own alpha, not each row's opacity — so a row fades
 *  smoothly with its position while moving, instead of stepping between
 *  per-slot values. Fully solid out past the first neighbors, fully clear
 *  before the VISIBLE_RADIUS slot. */
const MASK_SOLID_PX = NODE_SPACING_PX * 1.25;
const MASK_CLEAR_PX = NODE_SPACING_PX * 2.75;
/** The counter's right edge sits as far left of the focused icon's center as
 *  the focused row's name chip starts to the right of it — a mirror image. */
const COUNTER_RIGHT = `calc(50% + ${NODE_SIZE_PX / 2 + CHIP_GAP_PX}px)`;

const LIST_MASK = `linear-gradient(to bottom, transparent calc(50% - ${MASK_CLEAR_PX}px), black calc(50% - ${MASK_SOLID_PX}px), black calc(50% + ${MASK_SOLID_PX}px), transparent calc(50% + ${MASK_CLEAR_PX}px))`;
/** The header hangs off the focus slot rather than the panel's top edge —
 *  its bottom sits right where LIST_MASK turns fully clear, so it hugs the
 *  topmost visible row instead of floating over the list's empty upper band. */
const HEADER_BOTTOM = `calc(50% + ${MASK_CLEAR_PX}px)`;

/** Same hub-first-then-notes ordering FolderTree.tsx already renders. */
function levelItems(node: FolderNode): FileSearcherItem[] {
  const items: FileSearcherItem[] = node.folders.map((folder) => ({ kind: 'folder', node: folder }));
  if (node.hub) items.push({ kind: 'note', note: node.hub });
  for (const note of node.notes) items.push({ kind: 'note', note });
  return items;
}

/** Leads every unfiltered level — see `filtered` below. */
const NEW_NOTE_ITEM: FileSearcherItem = { kind: 'newNote' };

/** Where focus lands whenever a list is (re)built: the first real item, one
 *  below the "new note here" row — or the top match while filtering, where
 *  that row is hidden. Clamped at render (see `focus`), so an empty folder
 *  lands on the row itself. */
const FIRST_ITEM_INDEX = 1;

function focusForFilter(filterText: string): number {
  return filterText.trim() ? 0 : FIRST_ITEM_INDEX;
}

function itemKey(item: FileSearcherItem): string {
  if (item.kind === 'folder') return `folder:${item.node.path}`;
  return item.kind === 'note' ? `note:${item.note.id}` : 'new-note';
}

/** The folder at vault-relative `path` ('' is the root itself), or null if
 *  it no longer exists (e.g. deleted since the last refresh). */
function findFolder(root: FolderNode, path: string): FolderNode | null {
  let node = root;
  while (node.path !== path) {
    const next = node.folders.find((folder) => path === folder.path || path.startsWith(`${folder.path}/`));
    if (!next) return null;
    node = next;
  }
  return node;
}

function parentPath(path: string): string {
  const slashIndex = path.lastIndexOf('/');
  return slashIndex === -1 ? '' : path.slice(0, slashIndex);
}

/** One printable character — any script, plus space and punctuation — typed
 *  without Cmd/Ctrl/Option, so shortcuts like Cmd+W fall through instead of
 *  landing in the filter. */
function isFilterCharacter(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return false;
  return [...event.key].length === 1;
}

function hidePanel(): void {
  void invoke('hide_file_searcher_panel');
}

interface VaultData {
  notes: NoteSummary[];
  folderPaths: string[];
  /** The vault folder's own name — the breadcrumb's root segment. */
  vaultName: string;
}

/** Inlined rather than imported from vault/syncEngine.ts — that module pulls
 *  in the full sync engine (frontmatter/hub/link parsing, ulid, ...) for
 *  this one three-line helper, working against the whole point of this
 *  window having its own light bundle (see vite.config.ts's comment on
 *  why capture.html/filesearcher.html are split out). */
function toRelativePath(vaultRoot: string, absolutePath: string): string {
  return absolutePath.startsWith(vaultRoot) ? absolutePath.slice(vaultRoot.length).replace(/^\/+/, '') : absolutePath;
}

/** This window has no React context shared with "main" (separate JS
 *  runtime, see the component doc comment below) — it reads the vault
 *  straight from disk/DB, the same way CaptureWindow.tsx does. */
async function loadVaultData(): Promise<VaultData | null> {
  const config = await getAppConfig();
  const vaultRoot = config.last_vault_path;
  if (!vaultRoot) return null;

  const db = await getDb(vaultRoot);
  const [notes, absoluteFolderPaths] = await Promise.all([
    listNotes(db, {}),
    invoke<string[]>('list_vault_folders', { root: vaultRoot }),
  ]);
  return {
    notes,
    folderPaths: absoluteFolderPaths.map((path) => toRelativePath(vaultRoot, path)),
    vaultName: vaultRoot.split('/').filter(Boolean).pop() ?? vaultRoot,
  };
}

/**
 * The entire content of the "filesearcher" window (see
 * src-tauri/src/commands/file_searcher_panel.rs) — a small, borderless,
 * always-on-top popup, Raycast-style, separate from the main Auxin window so
 * it can float above every other app. Built once at startup and only ever
 * shown/hidden (never closed) — by the global shortcut handler and the
 * sidebar button (both in the main window) and by its own blur/Escape
 * handling. This window has its own JS runtime, so it reads the vault
 * directly rather than through the main window's React state, then emits
 * `fileSearcher://openNote` so the main window can open the tab and bring
 * itself forward.
 *
 * Squares for folders, circles for notes, in a vertical top-to-bottom
 * list per level — filtering is prefix-match-first, scoped to the current
 * level only. Up/Down step through siblings, wrapping end to end, Right/Enter drills into a folder
 * (Enter also opens a note), Left goes back up — the Finder column-view
 * mapping, since arrow keys now follow the list's own vertical axis.
 */
export function FileSearcherOverlay() {
  // `undefined` until the first load finishes, and nothing renders until
  // then — so the list never flashes "no matches" on its way in. `null`
  // once loaded means no vault is open.
  const [data, setData] = useState<VaultData | null | undefined>(undefined);
  const root = useMemo(() => (data ? buildFolderTree(data.notes, data.folderPaths) : null), [data]);

  // The current level as a vault-relative folder path ('' = root), resolved
  // against `root` in the same render below rather than held as a
  // FolderNode. Every refresh rebuilds `root` from new objects; a node held
  // in state would lag one render behind that, briefly changing the level
  // key and leaving an AnimatePresence exit layer (the old list, or "no
  // matches") ghosting over the current one.
  const [folderPath, setFolderPath] = useState('');
  const [filterText, setFilterText] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(FIRST_ITEM_INDEX);
  const [direction, setDirection] = useState<1 | -1>(1);
  // Set by the Up/Down handlers only (and cleared by every other action that
  // changes `focusedIndex` or the `filtered` array itself — folder entry,
  // going back, filtering). Threaded down to FileSearcherNode so a node that
  // newly enters the visible window because of a plain arrow-key scroll
  // mounts one slot further out and animates in — vs. popping in already in
  // place, which stays correct for a wholesale list swap (new level, new
  // filter results), where there's no "previous position" to scroll from.
  const [scrollDirection, setScrollDirection] = useState<0 | 1 | -1>(0);
  // Bumped on every hide — used as a React `key` below so returning to the
  // root for the next open is an instant remount, not an animated level
  // change. That animation would run while the panel is ordered out, and
  // framer-motion only removes an exiting element once its exit completes.
  const [sessionId, setSessionId] = useState(0);
  // Whether the level shown now was reached by drilling in or going back
  // (vs. being the root this open started on). Gates the level's own slide-in
  // on the motion.div itself rather than via `<AnimatePresence initial={false}>`:
  // that flag lands in the PresenceContext of the first level and stays there
  // for as long as that level is mounted, so every FileSearcherNode that
  // mounts later under it (arrow-key scrolling) would also skip its `initial`
  // and pop in, instead of fading in from one slot outside the list.
  const [hasNavigated, setHasNavigated] = useState(false);
  // Drives PANEL_VARIANTS. Mirrored into a ref so an outro's completion can
  // tell whether a reopen interrupted it (see handlePanelAnimationComplete).
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const isPanelVisibleRef = useRef(false);

  const setPanelVisible = useCallback((isVisible: boolean) => {
    isPanelVisibleRef.current = isVisible;
    setIsPanelVisible(isVisible);
  }, []);

  // Orders the panel out once the outro settles, and resets the session while
  // the content is already fully transparent, so that remount is never seen.
  // Skipped if the panel was reopened mid-outro — the ref, not the finished
  // variant alone, is the source of truth for that.
  const handlePanelAnimationComplete = useCallback((definition: unknown) => {
    if (definition !== 'hidden' || isPanelVisibleRef.current) return;
    setSessionId((id) => id + 1);
    setFolderPath('');
    setFilterText('');
    setFocusedIndex(FIRST_ITEM_INDEX);
    setScrollDirection(0);
    setHasNavigated(false);
    hidePanel();
  }, []);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | undefined;

    async function refresh() {
      const next = await loadVaultData();
      if (!isDisposed) setData(next);
    }

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          // Picks up vault changes made since the last open. Safe mid-view:
          // levels and items are keyed by path/id, not object identity.
          setPanelVisible(true);
          void refresh();
          return;
        }
        // Plays the outro — handlePanelAnimationComplete hides the panel.
        setPanelVisible(false);
      })
      .then((fn) => {
        // StrictMode runs this effect's cleanup before registration resolves;
        // unregister right away rather than leaking a second listener.
        if (isDisposed) fn();
        else unlisten = fn;
      });

    // Also load on mount — the panel is built hidden at app startup — so
    // data is already there the instant it's first shown.
    void refresh();

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [setPanelVisible]);

  // Falls back to the root if a refresh removed the current folder.
  const currentNode = root ? (findFolder(root, folderPath) ?? root) : null;
  const children = useMemo(() => (currentNode ? levelItems(currentNode) : []), [currentNode]);
  // The "new note here" row leads every level, directly above the default
  // focus (FIRST_ITEM_INDEX) — so every other item sits one past its
  // `levelItems` index, which goUp accounts for. Hidden while filtering: a
  // typed query is a search, and an empty result should still say "no matches".
  const filtered = useMemo(() => {
    if (filterText.trim() || !currentNode) return filterAndRank(children, filterText, itemName);
    return [NEW_NOTE_ITEM, ...children];
  }, [children, currentNode, filterText]);
  // `focusedIndex` can point past the end — FIRST_ITEM_INDEX in an empty
  // folder, or a refresh that shrank the list — so everything reads this.
  const focus = Math.max(0, Math.min(focusedIndex, filtered.length - 1));

  useEffect(() => {
    function goUp() {
      if (!root || !currentNode || currentNode.path === '') return;
      const exitingPath = currentNode.path;
      const parent = findFolder(root, parentPath(exitingPath)) ?? root;
      const exitIndex = levelItems(parent).findIndex((item) => item.kind === 'folder' && item.node.path === exitingPath);
      setDirection(-1);
      setHasNavigated(true);
      setFolderPath(parent.path);
      setFilterText('');
      setFocusedIndex(exitIndex >= 0 ? exitIndex + FIRST_ITEM_INDEX : FIRST_ITEM_INDEX);
      setScrollDirection(0);
    }

    async function openNote(relativePath: string) {
      await emit('fileSearcher://openNote', relativePath);
      setPanelVisible(false);
    }

    // The main window owns note creation (App.tsx's createNote, the same one
    // the sidepane's "new note here" runs) — this only says which folder.
    async function createNoteHere(folderPath: string) {
      await emit('fileSearcher://newNote', folderPath);
      setPanelVisible(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Plays the outro, which then hides the panel and resets the session.
        setPanelVisible(false);
        return;
      }

      // Up/Down still wrap end to end, but the list is laid out linearly, so a
      // wrap rewinds the whole list instead of stepping one slot. Rows that
      // mount because of a wrap enter from the side the list rewinds from —
      // the reverse of a plain step — so it reads as that rewind even when
      // the jump spans more rows than are mounted.
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (filtered.length > 0) {
          const isWrapping = focus === 0;
          setFocusedIndex(isWrapping ? filtered.length - 1 : focus - 1);
          setScrollDirection(isWrapping ? 1 : -1);
        }
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (filtered.length > 0) {
          const isWrapping = focus === filtered.length - 1;
          setFocusedIndex(isWrapping ? 0 : focus + 1);
          setScrollDirection(isWrapping ? -1 : 1);
        }
        return;
      }

      if (event.key === 'Enter' || event.key === 'ArrowRight') {
        event.preventDefault();
        const focused = filtered[focus];
        if (!focused) return;
        if (focused.kind === 'folder') {
          setDirection(1);
          setHasNavigated(true);
          setFolderPath(focused.node.path);
          setFilterText('');
          setFocusedIndex(FIRST_ITEM_INDEX);
          setScrollDirection(0);
        } else if (event.key === 'Enter' && focused.kind === 'note') {
          void openNote(focused.note.path);
        } else if (event.key === 'Enter' && currentNode) {
          void createNoteHere(currentNode.path);
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goUp();
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        if (filterText.length > 0) {
          const nextFilter = filterText.slice(0, -1);
          setFilterText(nextFilter);
          setFocusedIndex(focusForFilter(nextFilter));
          setScrollDirection(0);
        } else {
          goUp();
        }
        return;
      }

      if (isFilterCharacter(event)) {
        event.preventDefault();
        const nextFilter = filterText + event.key;
        setFilterText(nextFilter);
        setFocusedIndex(focusForFilter(nextFilter));
        setScrollDirection(0);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [root, currentNode, filtered, focus, filterText, setPanelVisible]);

  // Linear, not looped: nothing renders above the first row or below the
  // last, so the list visibly ends at both edges.
  const visibleItems = useMemo(() => {
    const start = Math.max(0, focus - VISIBLE_RADIUS);
    return filtered
      .slice(start, focus + VISIBLE_RADIUS + 1)
      .map((item, index) => ({ item, offset: start + index - focus, key: itemKey(item) }));
  }, [filtered, focus]);

  // The counter numbers real items only — the "new note here" row isn't
  // counted, and the counter hides while that row itself is focused.
  const counterBase = filtered[0]?.kind === 'newNote' ? 1 : 0;
  const isCounterShown = filtered[focus]?.kind !== 'newNote';

  const levelKey = currentNode ? `level:${currentNode.path}` : 'no-vault';

  return (
    <motion.div
      className="relative h-screen w-screen p-6 font-sans"
      variants={PANEL_VARIANTS}
      initial={false}
      animate={isPanelVisible ? 'shown' : 'hidden'}
      onAnimationComplete={handlePanelAnimationComplete}
    >
      {/* Keyed by `sessionId` so every open starts from a clean remount —
       *  see that state's own comment for why. Header and list share one box
       *  so HEADER_BOTTOM and LIST_MASK resolve `50%` against the same height. */}
      <div key={sessionId} className="relative h-full">
        {/* Slides right-to-left when drilling in (Right arrow, direction 1) and
            left-to-right when going back (Left arrow, direction -1) — the new
            level always enters from the same side its trigger key points to,
            and the old level exits toward the opposite side. Both need to be
            visible and moving *at the same time* for this to read as one push
            rather than two separate animations, so the old and new levels are
            absolutely stacked on top of each other in a shared relative
            container (not left as plain flex children, which `mode="wait"`
            would otherwise require to avoid a layout collision) and
            AnimatePresence is left in its default simultaneous mode. */}
        {/* A size container so FileSearcherNode's chip can cap its width
            against this box's real width (`cqw`), masked so rows fade out
            toward its edges (see LIST_MASK). */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ containerType: 'size', maskImage: LIST_MASK, WebkitMaskImage: LIST_MASK }}
        >
          {data !== undefined && (
            <AnimatePresence custom={direction}>
              <motion.div
                key={levelKey}
                custom={direction}
                variants={LEVEL_VARIANTS}
                initial={hasNavigated ? 'enter' : false}
                animate="center"
                exit="exit"
                transition={NODE_TRANSITION}
                className="absolute inset-0"
              >
                {!root || filtered.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-white/50" style={{ fontSize: '0.85rem' }}>
                    <span className="border border-white/25 bg-black px-2 py-0.5">{root ? 'no matches' : 'no vault open'}</span>
                  </div>
                ) : (
                  <>
                    {/* Where focus sits among this level's items. Numbered
                        past the new-note row (see `counterBase`). Pinned beside the focus slot
                        rather than rendered by the focused row, so it holds
                        still while rows scroll through focus, yet still slides
                        with its level on a folder change. */}
                    {isCounterShown && (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap bg-black px-2 py-0.5 leading-4 tabular-nums text-white/40"
                        style={{ right: COUNTER_RIGHT, fontSize: '0.68rem' }}
                      >
                        {focus + 1 - counterBase} / {filtered.length - counterBase}
                      </span>
                    )}
                    {visibleItems.map(({ item, offset, key }) => (
                      <FileSearcherNode key={key} item={item} offset={offset} scrollDirection={scrollDirection} />
                    ))}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
        {/* Outside the masked list so it's never faded, and after it so it
            paints on top — though the rows under it are masked clear anyway. */}
        <div className="absolute inset-x-0" style={{ bottom: HEADER_BOTTOM }}>
          <FileSearcherHeader
            vaultName={data?.vaultName ?? null}
            folderPath={currentNode?.path ?? ''}
            filterText={filterText}
          />
        </div>
      </div>
    </motion.div>
  );
}
