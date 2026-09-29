import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { NoteSummary } from '../db/queries/notes';
import { CANVAS_DROP_ID, announceCanvasDrag, announceCanvasDrop, type CanvasDropDetail } from '../canvas/canvasDrop';

/** Pixels of pointer movement before a mousedown counts as a drag rather
 *  than a click/double-click. Below this, releasing acts as normal. */
const DRAG_THRESHOLD_PX = 4;
/** Sentinel `data-drop-id` for the vault root — an empty string would be
 *  indistinguishable from "no drop-id attribute found". */
export const ROOT_DROP_ID = '__root__';

export type DragItem = { kind: 'note'; note: NoteSummary } | { kind: 'folder'; path: string };

interface TreeDragOptions {
  /** Both targets are the destination *parent* folder ('' for the vault root). */
  onMoveNote: (note: NoteSummary, targetParentPath: string) => void;
  onMoveFolder: (folderPath: string, targetParentPath: string) => void;
}

function canvasDetailFor(item: Extract<DragItem, { kind: 'note' }>, event: MouseEvent): CanvasDropDetail {
  return {
    path: item.note.path,
    isPdf: item.note.isPdf === true,
    isCanvas: item.note.isCanvas === true,
    clientX: event.clientX,
    clientY: event.clientY,
  };
}

/** Pointer-tracked drag-and-drop for moving a note or folder into another
 *  folder, shared by the file tree and the file browser. Manual tracking
 *  rather than the native HTML5 Drag and Drop API, matching TabBar.tsx's
 *  tab-reorder drag — `dragstart`/`drop` don't fire reliably inside Tauri's
 *  macOS WKWebView. The pointer resolves to the nearest `[data-drop-id]`
 *  element (a folder row, or `ROOT_DROP_ID`) via `elementFromPoint`, which is
 *  highlighted, and the move commits on release. */
export function useTreeDrag({ onMoveNote, onMoveFolder }: TreeDragOptions) {
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const dropTargetIdRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  // The cursor-following name label is positioned imperatively (not via
  // React state) so a fast drag's continuous mousemove stream doesn't force
  // a re-render on every pixel — same reasoning as TabBar.tsx's FLIP
  // transforms being set directly on the DOM node.
  const ghostRef = useRef<HTMLDivElement>(null);

  function beginDrag(item: DragItem, event: ReactMouseEvent) {
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

      // Over the canvas the canvas draws a card preview instead of this label.
      const isOverBoard = item.kind === 'note' && nextTargetId === CANVAS_DROP_ID;
      announceCanvasDrag(isOverBoard ? canvasDetailFor(item, moveEvent) : null);
      if (ghostRef.current) ghostRef.current.style.display = isOverBoard ? 'none' : '';
      if (ghostRef.current && !isOverBoard) {
        // `left`/`top` place the cursor point itself; the permanent
        // `-translate-x-1/2 -translate-y-1/2` class on the element then
        // shifts it back by half its own (dynamic, title-length-dependent)
        // size, centering the label on the cursor regardless of content.
        ghostRef.current.style.left = `${moveEvent.clientX}px`;
        ghostRef.current.style.top = `${moveEvent.clientY}px`;
      }
    }

    function handleMouseUp(upEvent: MouseEvent) {
      announceCanvasDrag(null);
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
        if (targetId === CANVAS_DROP_ID) {
          // Released over the canvas: place the note/PDF as a card there
          // (CanvasView listens) — nothing moves on disk.
          if (item.kind === 'note') announceCanvasDrop(canvasDetailFor(item, upEvent));
        } else if (targetId) {
          const targetParentPath = targetId === ROOT_DROP_ID ? '' : targetId;
          if (item.kind === 'note') onMoveNote(item.note, targetParentPath);
          else onMoveFolder(item.path, targetParentPath);
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  /** True (once) when the click that follows a drag's mouseup should be
   *  swallowed rather than acted on. */
  function consumeSuppressedClick(): boolean {
    const wasSuppressed = suppressClickRef.current;
    suppressClickRef.current = false;
    return wasSuppressed;
  }

  const ghost: ReactNode = draggedItem && (
    <div
      ref={ghostRef}
      className="pointer-events-none fixed left-0 top-0 z-50 max-w-[200px] -translate-x-1/2 -translate-y-1/2 truncate border border-border-strong bg-bg px-2 py-1 text-fg-prominent"
      style={{ fontSize: '0.75rem', left: '-9999px', top: '-9999px' }}
    >
      {draggedItem.kind === 'note' ? draggedItem.note.title : (draggedItem.path.split('/').pop() ?? draggedItem.path)}
    </div>
  );

  return { draggedItem, dropTargetId, beginDrag, consumeSuppressedClick, ghost };
}
