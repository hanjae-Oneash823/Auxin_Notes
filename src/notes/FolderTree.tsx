import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'framer-motion';
import { CaretRight, Folder, FolderOpen, SquaresFour } from '@phosphor-icons/react';
import { NoteListItem } from './NoteListItem';
import { getDb } from '../db/client';
import type { NoteSummary } from '../db/queries/notes';
import { getCollapsedFolders, setCollapsedFolders } from '../db/queries/folderState';
import { buildFolderTree, flattenTree, type FolderNode, type TreeRow } from '../vault/folderTree';
import { uniqueFolderName } from '../vault/folderEngine';
import { ContextMenu } from '../layout/ContextMenu';
import { agentMenuItem } from '../terminal/terminalAgent';
import { agentTargetFromPath } from '../terminal/terminalAgentPrompt';
import { CountBadge } from '../layout/CountBadge';
import { flyCardToTab } from '../layout/flyToTab';

type RowContextMenu =
  | { kind: 'note'; note: NoteSummary; x: number; y: number }
  | { kind: 'folder'; node: FolderNode; x: number; y: number }
  | { kind: 'empty'; x: number; y: number };

const ROW_HEIGHT_PX = 26;
const OVERSCAN = 12;
const INDENT_PX = 14;
/** Pixels of pointer movement before a mousedown counts as a drag rather
 *  than a click/double-click. Below this, releasing acts as normal. */
const DRAG_THRESHOLD_PX = 4;
/** Sentinel `data-drop-id` for the vault root — an empty string would be
 *  indistinguishable from "no drop-id attribute found". */
const ROOT_DROP_ID = '__root__';

// Matches --duration-panel / --ease-panel (tokens.css) — the row grow/shrink
// animation should feel like the rest of the app's transitions, not a
// one-off timing. Kept as a JS constant (framer-motion doesn't read CSS
// custom properties) and mirrored in ROW_ANIM_MS for the setTimeout that
// finalizes a collapse once its shrink animation has actually finished.
const ROW_ANIM = { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const };
const ROW_ANIM_MS = 300;

type DragItem = { kind: 'note'; note: NoteSummary } | { kind: 'folder'; path: string };

interface FolderTreeProps {
  vaultRoot: string;
  notes: NoteSummary[];
  folderPaths: string[];
  activePath: string | null;
  renamingNoteId: string | null;
  renameValue: string;
  onSelect: (path: string) => void;
  onStartRename: (note: NoteSummary) => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: (note: NoteSummary) => void;
  onRenameCancel: () => void;
  /** Both targets are the destination *parent* folder ('' for the vault
   *  root) — the dragged note/folder keeps its own name, matching
   *  folderEngine.ts's `moveNoteToFolder`/`moveFolder` convention. */
  onMoveNote: (note: NoteSummary, targetParentPath: string) => void;
  onMoveFolder: (folderPath: string, targetParentPath: string) => void;
  onRenameFolder: (folderPath: string, newName: string) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onDeleteFolder: (folderPath: string) => void;
  onRevealNote: (note: NoteSummary) => void;
  onRevealFolder: (folderPath: string) => void;
  onNewNoteInFolder: (folderPath: string) => void;
  onNewHubInFolder: (folderPath: string) => void;
  onNewCanvasInFolder: (folderPath: string) => void;
  onImportPdfInFolder: (folderPath: string) => void;
  /** Right-clicking empty tree space (below/between rows) offers this —
   *  same root-level "start naming a new folder" affordance as the
   *  sidebar's own `[+] folder` button. */
  onNewFolderAtRoot: () => void;
  /** Right-clicking a folder's own row offers this — unlike
   *  `onNewFolderAtRoot`'s typed-name input, the new folder is created
   *  immediately (with an auto-generated unique name, see
   *  `uniqueFolderName`) and dropped straight into the same inline rename
   *  box `startFolderRename` already uses for double-click, so the flow is
   *  create-then-rename rather than name-then-create. */
  onNewFolderInFolder: (relativePath: string) => void;
}

/** Stable per-row identity, independent of its position in the flattened
 *  list — used both as the virtualizer's `getItemKey` (so a row keeps its
 *  own React/DOM identity as sibling rows appear and disappear around it,
 *  rather than index-based keys causing an unrelated row to silently
 *  inherit an animation mid-flight) and to look a row up in
 *  `enteringKeys`. */
function rowKey(row: TreeRow): string {
  return row.kind === 'folder' ? `folder:${row.node.path}` : `note:${row.note.id}`;
}

/** A row's own containing-folder path (itself, for a folder row; its parent,
 *  for a note row) — used to test whether a row lives inside a folder that's
 *  currently mid-close-animation. */
function rowOwnPath(row: TreeRow): string {
  return row.kind === 'folder' ? row.node.path : row.folderPath;
}

function isDescendantOrSelf(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

function withoutPath(paths: Set<string>, path: string): Set<string> {
  const next = new Set(paths);
  next.delete(path);
  return next;
}


/**
 * Sidebar note list, grown from a flat virtualized list into a collapsible
 * folder tree. Still virtualized the same way — the expanded tree is
 * flattened into an ordered row list (`flattenTree`) and only the rows
 * in/near the visible scroll range are mounted.
 *
 * Drag-and-drop (for moving a note or folder into another folder) uses
 * manual pointer tracking rather than the native HTML5 Drag and Drop API,
 * matching TabBar.tsx's tab-reorder drag — `dragstart`/`drop` don't fire
 * reliably inside Tauri's macOS WKWebView. Unlike the tab strip, there's no
 * live-reorder animation here: the pointer just resolves to a single drop
 * target (a folder row, or the root) via `elementFromPoint`, which is
 * highlighted, and the move commits on release.
 *
 * Expand/collapse animation: react-virtual positions every row by a fixed
 * `estimateSize` slot (translateY math from index × row height), so rows
 * below a toggled folder can't be smoothly pushed down/up the way a plain
 * (non-virtualized) accordion would — the outer virtualized slot for every
 * row snaps to its final position/count the instant `collapsedPaths`
 * changes. What *can* animate cleanly within an already-correctly-sized
 * slot is that row's own content growing/shrinking in place, so that's what
 * this does: an inner `motion.div` per row animates height+opacity from 0 on
 * the frame a folder's children are first revealed (`enteringKeys`, computed
 * as the exact row-key delta a toggle is about to reveal), and collapsing a
 * folder defers actually removing its children from `collapsedPaths` — kept
 * in `closingPaths` instead — until their shrink animation has finished
 * playing, instead of yanking them out of the tree mid-animation.
 */
export function FolderTree({
  vaultRoot,
  notes,
  folderPaths,
  activePath,
  renamingNoteId,
  renameValue,
  onSelect,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onMoveNote,
  onMoveFolder,
  onRenameFolder,
  onDeleteNote,
  onDeleteFolder,
  onRevealNote,
  onRevealFolder,
  onNewNoteInFolder,
  onNewHubInFolder,
  onNewCanvasInFolder,
  onImportPdfInFolder,
  onNewFolderAtRoot,
  onNewFolderInFolder,
}: FolderTreeProps) {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [closingPaths, setClosingPaths] = useState<Set<string>>(new Set());
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set());
  const [renamingFolderPath, setRenamingFolderPath] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenu | null>(null);

  // Tracks which `vaultRoot` `collapsedPaths` has finished loading its
  // persisted state for — the persist effect below must not fire on the
  // initial (empty, "everything expanded") state before that load lands, or
  // it would overwrite the vault's saved collapsed set on every app start.
  const loadedForVaultRootRef = useRef<string | null>(null);

  useEffect(() => {
    loadedForVaultRootRef.current = null;
    let cancelled = false;
    void (async () => {
      const db = await getDb(vaultRoot);
      const paths = await getCollapsedFolders(db);
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
    void getDb(vaultRoot).then((db) => setCollapsedFolders(db, [...collapsedPaths]));
  }, [vaultRoot, collapsedPaths]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const dropTargetIdRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  // The cursor-following name label is positioned imperatively (not via
  // React state) so a fast drag's continuous mousemove stream doesn't force
  // a re-render on every pixel — same reasoning as TabBar.tsx's FLIP
  // transforms being set directly on the DOM node.
  const ghostRef = useRef<HTMLDivElement>(null);

  const root = buildFolderTree(notes, folderPaths);
  const rows = flattenTree(root, collapsedPaths);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: OVERSCAN,
    getItemKey: (index) => rowKey(rows[index]),
  });

  function toggleCollapsed(path: string) {
    if (collapsedPaths.has(path)) {
      // Opening — diff the about-to-be-revealed rows against the current
      // ones so exactly the newly-appearing rows (this folder's children,
      // and any of their own already-expanded descendants) get flagged for
      // a grow+fade entrance; a row that's merely scrolling into the
      // virtualized window later shouldn't replay that animation, hence
      // clearing the flag once the animation's had time to finish.
      const revealedKeys = flattenTree(root, withoutPath(collapsedPaths, path))
        .map(rowKey)
        .filter((key) => !rows.some((row) => rowKey(row) === key));

      setEnteringKeys((prev) => {
        const next = new Set(prev);
        for (const key of revealedKeys) next.add(key);
        return next;
      });
      setCollapsedPaths((prev) => withoutPath(prev, path));
      window.setTimeout(() => {
        setEnteringKeys((prev) => {
          const next = new Set(prev);
          for (const key of revealedKeys) next.delete(key);
          return next;
        });
      }, ROW_ANIM_MS);
      return;
    }

    // Closing — an instant `collapsedPaths` add would yank the children out
    // of `rows` (and the virtualizer) before they had any chance to play a
    // shrink-out animation, so the actual collapse is deferred until then.
    setClosingPaths((prev) => new Set(prev).add(path));
    window.setTimeout(() => {
      setClosingPaths((prev) => withoutPath(prev, path));
      setCollapsedPaths((prev) => new Set(prev).add(path));
    }, ROW_ANIM_MS);
  }

  function isRowClosing(row: TreeRow): boolean {
    if (closingPaths.size === 0) return false;
    // A closing folder's own header row never animates away — only rows
    // actually *inside* it (its own notes/subfolders, at any depth) shrink;
    // the header stays put with just its caret/icon flipping to "closed".
    // Without this check, `isDescendantOrSelf` below would count the row as
    // a "descendant" of itself and shrink the header along with its
    // contents, which is exactly the flicker being fixed here.
    if (row.kind === 'folder' && closingPaths.has(row.node.path)) return false;
    const path = rowOwnPath(row);
    for (const ancestor of closingPaths) {
      if (isDescendantOrSelf(path, ancestor)) return true;
    }
    return false;
  }

  function startFolderRename(node: { path: string; name: string }) {
    setRenamingFolderPath(node.path);
    setFolderRenameValue(node.name);
  }

  function commitFolderRename(path: string) {
    const name = folderRenameValue.trim();
    setRenamingFolderPath(null);
    if (!name || name === path.split('/').pop()) return;
    onRenameFolder(path, name);
  }

  /** Creates a new folder under `parentPath` immediately (auto-named to
   *  avoid a collision with an existing sibling) and drops straight into
   *  that folder's inline rename box — same "create then let the user
   *  retype the name" flow `startFolderRename` gives a double-click,
   *  applied to a brand-new folder instead of an existing one. */
  function handleNewFolderHere(parentPath: string) {
    const name = uniqueFolderName(folderPaths, parentPath);
    const path = parentPath ? `${parentPath}/${name}` : name;
    onNewFolderInFolder(path);
    // The new folder's own row (and its rename box) only renders if
    // `parentPath` is expanded — right-clicking a folder doesn't require it
    // to already be open, so make sure it is.
    setCollapsedPaths((prev) => withoutPath(prev, parentPath));
    setRenamingFolderPath(path);
    setFolderRenameValue(name);
  }

  function beginDrag(item: DragItem, event: React.MouseEvent) {
    if (event.button !== 0) return;
    dragStateRef.current = { startX: event.clientX, startY: event.clientY, moved: false };

    function handleMouseMove(moveEvent: MouseEvent) {
      const state = dragStateRef.current;
      if (!state) return;

      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        state.moved = true;
        setDraggedItem(item);
      }
      if (!state.moved) return;

      const hovered = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const dropEl = hovered instanceof Element ? hovered.closest<HTMLElement>('[data-drop-id]') : null;
      const nextTargetId = dropEl?.dataset.dropId ?? null;
      dropTargetIdRef.current = nextTargetId;
      setDropTargetId(nextTargetId);

      if (ghostRef.current) {
        // `left`/`top` place the cursor point itself; the permanent
        // `-translate-x-1/2 -translate-y-1/2` class on the element then
        // shifts it back by half its own (dynamic, title-length-dependent)
        // size, centering the label on the cursor regardless of content.
        ghostRef.current.style.left = `${moveEvent.clientX}px`;
        ghostRef.current.style.top = `${moveEvent.clientY}px`;
      }
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const state = dragStateRef.current;
      const targetId = dropTargetIdRef.current;
      dragStateRef.current = null;
      dropTargetIdRef.current = null;
      setDraggedItem(null);
      setDropTargetId(null);

      if (state?.moved) {
        suppressClickRef.current = true;
        if (targetId) {
          const targetParentPath = targetId === ROOT_DROP_ID ? '' : targetId;
          if (item.kind === 'note') onMoveNote(item.note, targetParentPath);
          else onMoveFolder(item.path, targetParentPath);
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  /** Opens a note and flies the clicked row into its sidebar tab — the
   *  animation must start first, while `source` still exists. */
  function openNote(path: string, source: Element) {
    flyCardToTab(source, `${vaultRoot}/${path}`);
    onSelect(path);
  }

  function guardedClick(handler: () => void) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    handler();
  }

  /** One thin vertical line per ancestor level, so a deeply nested row's
   *  lineage back up to the root stays traceable at a glance rather than
   *  relying on indentation alone. Deliberately not "elbowed" to the last
   *  child at each level (the classic └─ tree look) — plain continuous
   *  lines needed no extra bookkeeping in flattenTree and read clearly
   *  enough at the shallow depths a note vault actually reaches. */
  function renderIndentGuides(depth: number) {
    return Array.from({ length: depth }, (_, level) => (
      <div
        key={level}
        aria-hidden
        className="pointer-events-none absolute top-0 h-full w-px bg-border"
        style={{ left: level * INDENT_PX + INDENT_PX / 2 }}
      />
    ));
  }

  function renderRow(row: TreeRow) {
    const indent = row.depth * INDENT_PX;

    if (row.kind === 'folder') {
      const { node } = row;
      const isCollapsed = collapsedPaths.has(node.path) || closingPaths.has(node.path);
      const isDragging = draggedItem?.kind === 'folder' && draggedItem.path === node.path;
      const isDropTarget = dropTargetId === node.path && !isDragging;

      if (renamingFolderPath === node.path) {
        return (
          <input
            autoFocus
            value={folderRenameValue}
            onChange={(event) => setFolderRenameValue(event.target.value)}
            onBlur={() => setRenamingFolderPath(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitFolderRename(node.path);
              if (event.key === 'Escape') setRenamingFolderPath(null);
            }}
            style={{ paddingLeft: indent, fontSize: '0.85rem' }}
            className="w-full rounded-row border border-border-strong bg-transparent px-1 text-left text-fg-prominent outline-none"
          />
        );
      }

      return (
        <div
          data-drop-id={node.path}
          onMouseDown={(event) => beginDrag({ kind: 'folder', path: node.path }, event)}
          onClick={() => guardedClick(() => toggleCollapsed(node.path))}
          onDoubleClick={() => startFolderRename(node)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setRowContextMenu({ kind: 'folder', node, x: event.clientX, y: event.clientY });
          }}
          style={{ paddingLeft: indent, fontSize: '0.85rem' }}
          className={`flex w-full cursor-pointer select-none items-center gap-1.5 truncate rounded-row border px-1.5 py-0.5 text-left transition-colors duration-panel ease-panel ${
            isDropTarget
              ? 'border-accent-link bg-border-subtle text-fg-prominent'
              : 'border-transparent text-fg-prominent hover:bg-border-subtle'
          } ${isDragging ? 'opacity-40' : ''}`}
        >
          <CaretRight
            size={11}
            weight="bold"
            className={`shrink-0 transition-transform duration-panel ease-panel ${isCollapsed ? '' : 'rotate-90'}`}
          />
          {isCollapsed ? (
            <Folder size={12} weight="regular" className="shrink-0" />
          ) : (
            <FolderOpen size={12} weight="regular" className="shrink-0" />
          )}
          <span className="flex-1 truncate">{node.name}</span>
          {node.noteCount > 0 && <CountBadge count={node.noteCount} size="sm" className="mr-1" />}
        </div>
      );
    }

    if (row.kind === 'hub') {
      // Deliberately distinct from both folder rows (accent-tag, `[name]`)
      // and ordinary note rows (plain fg-muted title): a left accent stripe
      // + dashboard icon marks this as the folder's one pinned hub, not
      // just another note living in it. Not draggable — a hub's file
      // location *is* the folder it represents, so moving it out would
      // silently strip that folder of its hub.
      return (
        <div
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setRowContextMenu({ kind: 'note', note: row.note, x: event.clientX, y: event.clientY });
          }}
          onClickCapture={(event) => {
            if (suppressClickRef.current) {
              event.stopPropagation();
              suppressClickRef.current = false;
            }
          }}
          style={{ paddingLeft: indent }}
        >
          <button
            type="button"
            onClick={(event) => openNote(row.note.path, event.currentTarget)}
            className={`flex w-full items-center gap-1.5 truncate rounded-row py-0.5 pl-1.5 text-left transition-colors duration-panel ease-panel ${
              activePath === row.note.path ? 'bg-border-default text-fg' : 'text-accent-link hover:bg-border-subtle'
            }`}
            style={{ fontSize: '0.82rem' }}
          >
            <SquaresFour size={12} weight="bold" className="shrink-0" />
            <span className="truncate">{row.note.title}</span>
          </button>
        </div>
      );
    }

    const { note, folderPath } = row;
    const isDragging = draggedItem?.kind === 'note' && draggedItem.note.id === note.id;

    return (
      <div
        // Note rows carry a drop-id purely so hovering one resolves to its
        // *containing folder* as the target (see beginDrag's elementFromPoint
        // lookup) — the visual "drop here" highlight only ever appears on
        // that folder's own header row, so nothing here reacts to
        // dropTargetId; highlighting every note row in the target folder at
        // once read as noisy rather than clear.
        data-drop-id={folderPath || undefined}
        onMouseDown={(event) => beginDrag({ kind: 'note', note }, event)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setRowContextMenu({ kind: 'note', note, x: event.clientX, y: event.clientY });
        }}
        onClickCapture={(event) => {
          if (suppressClickRef.current) {
            event.stopPropagation();
            suppressClickRef.current = false;
          }
        }}
        style={{ paddingLeft: indent }}
        className={isDragging ? 'opacity-40' : ''}
      >
        <NoteListItem
          note={note}
          isActive={activePath === note.path}
          isRenaming={renamingNoteId === note.id}
          renameValue={renameValue}
          onSelect={(source) => openNote(note.path, source)}
          onStartRename={() => onStartRename(note)}
          onRenameChange={onRenameChange}
          onRenameCommit={() => onRenameCommit(note)}
          onRenameCancel={onRenameCancel}
        />
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        data-drop-id={ROOT_DROP_ID}
        onContextMenu={(event) => {
          event.preventDefault();
          setRowContextMenu({ kind: 'empty', x: event.clientX, y: event.clientY });
        }}
        // -mr-3.5 runs the scroll container out to the panel's edge (packet's
        // px-1.5 + panel's px-2) so the scrollbar sits flush; pr-2.5 pads the
        // rows back to match the tab list in the left sidebar.
        className="sidebar-scroll -mr-3.5 min-h-0 flex-1 overflow-y-auto pr-2.5"
      >
        {rows.length === 0 ? (
          <span className="px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
            no notes
          </span>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              const key = rowKey(row);
              const closing = isRowClosing(row);
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <motion.div
                    initial={enteringKeys.has(key) ? { height: 0, opacity: 0 } : false}
                    animate={{ height: closing ? 0 : ROW_HEIGHT_PX, opacity: closing ? 0 : 1 }}
                    transition={ROW_ANIM}
                    style={{ overflow: 'hidden' }}
                  >
                    {renderIndentGuides(row.depth)}
                    {renderRow(row)}
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {draggedItem && (
        <div
          ref={ghostRef}
          className="pointer-events-none fixed left-0 top-0 z-50 max-w-[200px] -translate-x-1/2 -translate-y-1/2 truncate border border-border-strong bg-bg px-2 py-1 text-fg-prominent"
          style={{ fontSize: '0.75rem', left: '-9999px', top: '-9999px' }}
        >
          {draggedItem.kind === 'note' ? draggedItem.note.title : (draggedItem.path.split('/').pop() ?? draggedItem.path)}
        </div>
      )}
      {rowContextMenu?.kind === 'note' && (
        <ContextMenu
          x={rowContextMenu.x}
          y={rowContextMenu.y}
          onClose={() => setRowContextMenu(null)}
          items={[
            { label: 'rename', onSelect: () => onStartRename(rowContextMenu.note) },
            agentMenuItem(agentTargetFromPath(`${vaultRoot}/${rowContextMenu.note.path}`, false)),
            { label: 'reveal in finder', onSelect: () => onRevealNote(rowContextMenu.note) },
            { label: 'delete', onSelect: () => onDeleteNote(rowContextMenu.note), danger: true },
          ]}
        />
      )}
      {rowContextMenu?.kind === 'folder' && (
        <ContextMenu
          x={rowContextMenu.x}
          y={rowContextMenu.y}
          onClose={() => setRowContextMenu(null)}
          items={[
            { label: 'new note here', onSelect: () => onNewNoteInFolder(rowContextMenu.node.path) },
            { label: 'new canvas here', onSelect: () => onNewCanvasInFolder(rowContextMenu.node.path) },
            { label: 'import pdf here', onSelect: () => onImportPdfInFolder(rowContextMenu.node.path) },
            // A folder either has a hub or doesn't — this swaps to "open
            // hub" once one exists rather than offering to create a second.
            rowContextMenu.node.hub
              ? {
                  label: 'open hub',
                  onSelect: () => {
                    if (rowContextMenu.node.hub) onSelect(rowContextMenu.node.hub.path);
                  },
                }
              : { label: 'new hub here', onSelect: () => onNewHubInFolder(rowContextMenu.node.path) },
            { label: 'new folder here', onSelect: () => handleNewFolderHere(rowContextMenu.node.path) },
            {
              label: 'rename',
              onSelect: () =>
                startFolderRename({
                  path: rowContextMenu.node.path,
                  name: rowContextMenu.node.path.split('/').pop() ?? rowContextMenu.node.path,
                }),
            },
            agentMenuItem(agentTargetFromPath(`${vaultRoot}/${rowContextMenu.node.path}`, true)),
            { label: 'reveal in finder', onSelect: () => onRevealFolder(rowContextMenu.node.path) },
            { label: 'delete', onSelect: () => onDeleteFolder(rowContextMenu.node.path), danger: true },
          ]}
        />
      )}
      {rowContextMenu?.kind === 'empty' && (
        <ContextMenu
          x={rowContextMenu.x}
          y={rowContextMenu.y}
          onClose={() => setRowContextMenu(null)}
          items={[
            { label: 'new note', onSelect: () => onNewNoteInFolder('') },
            { label: 'new canvas', onSelect: () => onNewCanvasInFolder('') },
            { label: 'import pdf', onSelect: () => onImportPdfInFolder('') },
            root.hub
              ? {
                  label: 'open hub',
                  onSelect: () => {
                    if (root.hub) onSelect(root.hub.path);
                  },
                }
              : { label: 'new hub', onSelect: () => onNewHubInFolder('') },
            { label: 'new folder', onSelect: onNewFolderAtRoot },
          ]}
        />
      )}
    </>
  );
}
