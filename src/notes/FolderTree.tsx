import { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CaretRight, Folder, FolderOpen } from '@phosphor-icons/react';
import { NoteListItem } from './NoteListItem';
import type { NoteSummary } from '../db/queries/notes';
import { buildFolderTree, flattenTree, type TreeRow } from '../vault/folderTree';
import { ContextMenu } from '../layout/ContextMenu';

type RowContextMenu =
  | { kind: 'note'; note: NoteSummary; x: number; y: number }
  | { kind: 'folder'; path: string; x: number; y: number }
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

type DragItem = { kind: 'note'; note: NoteSummary } | { kind: 'folder'; path: string };

interface FolderTreeProps {
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
  /** Right-clicking empty tree space (below/between rows) offers this —
   *  same root-level "start naming a new folder" affordance as the
   *  sidebar's own `[+] folder` button. */
  onNewFolderAtRoot: () => void;
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
 */
export function FolderTree({
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
  onNewFolderAtRoot,
}: FolderTreeProps) {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [renamingFolderPath, setRenamingFolderPath] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenu | null>(null);

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
  });

  function toggleCollapsed(path: string) {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
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
      const isCollapsed = collapsedPaths.has(node.path);
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
            className="w-full border border-border-strong bg-transparent px-1 text-left text-fg-prominent outline-none"
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
            setRowContextMenu({ kind: 'folder', path: node.path, x: event.clientX, y: event.clientY });
          }}
          style={{ paddingLeft: indent, fontSize: '0.85rem' }}
          className={`flex w-full cursor-pointer select-none items-center gap-1 truncate border px-1 text-left transition-colors duration-panel ease-panel ${
            isDropTarget
              ? 'border-accent-link bg-border-subtle text-fg-prominent'
              : 'border-transparent text-accent-tag hover:text-fg-prominent'
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
          <span className="flex-1 truncate">[{node.name}]</span>
          {node.noteCount > 0 && (
            <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.7rem' }}>
              {node.noteCount}
            </span>
          )}
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
          onSelect={() => onSelect(note.path)}
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
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {rows.length === 0 ? (
          <span className="px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
            no notes
          </span>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => (
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
                {renderIndentGuides(rows[virtualRow.index].depth)}
                {renderRow(rows[virtualRow.index])}
              </div>
            ))}
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
            { label: 'new note here', onSelect: () => onNewNoteInFolder(rowContextMenu.path) },
            {
              label: 'rename',
              onSelect: () =>
                startFolderRename({
                  path: rowContextMenu.path,
                  name: rowContextMenu.path.split('/').pop() ?? rowContextMenu.path,
                }),
            },
            { label: 'reveal in finder', onSelect: () => onRevealFolder(rowContextMenu.path) },
            { label: 'delete', onSelect: () => onDeleteFolder(rowContextMenu.path), danger: true },
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
            { label: 'new folder', onSelect: onNewFolderAtRoot },
          ]}
        />
      )}
    </>
  );
}
