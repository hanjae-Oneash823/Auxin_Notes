/** A note or PDF dragged out of the sidebar file tree and released over the
 *  canvas. The tree drag (`useTreeDrag`) is pointer-tracked rather than native
 *  HTML5 drag-and-drop, so the canvas marks itself with `data-drop-id` and the
 *  tree announces the drop with this window event. */
export const CANVAS_DROP_ID = '__canvas__';
export const CANVAS_DROP_EVENT = 'auxin:canvas-drop';

export interface CanvasDropDetail {
  /** Vault-relative path of the dropped note or PDF. */
  path: string;
  isPdf: boolean;
  isCanvas: boolean;
  clientX: number;
  clientY: number;
}

export const CANVAS_DRAG_EVENT = 'auxin:canvas-drag';

/** Where a dragged note/PDF is hovering over the canvas right now, or `null`
 *  once it has left (or the drag ended) — the canvas shows a card preview. */
export type CanvasDragDetail = CanvasDropDetail | null;

export function announceCanvasDrag(detail: CanvasDragDetail): void {
  window.dispatchEvent(new CustomEvent<CanvasDragDetail>(CANVAS_DRAG_EVENT, { detail }));
}

export function announceCanvasDrop(detail: CanvasDropDetail): void {
  window.dispatchEvent(new CustomEvent<CanvasDropDetail>(CANVAS_DROP_EVENT, { detail }));
}

/** True when the pointer is over the canvas's drop zone. */
export function isOverCanvas(clientX: number, clientY: number): boolean {
  const zone = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-drop-id]');
  return zone?.dataset.dropId === CANVAS_DROP_ID;
}
