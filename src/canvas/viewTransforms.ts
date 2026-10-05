import type { Point, Rect } from './canvasGeometry';

/** The board's camera: the world is drawn at `translate(pan) scale(zoom)`, so
 *  a world point lands on screen at `pan + world * zoom`. */
export interface ViewState {
  zoom: number;
  pan: Point;
}

export interface ViewportSize {
  w: number;
  h: number;
}

/** Smallest rect containing every card, or null for none. */
export function boundsOfCards(cards: readonly Rect[]): Rect | null {
  if (cards.length === 0) return null;
  const minX = Math.min(...cards.map((c) => c.x));
  const minY = Math.min(...cards.map((c) => c.y));
  return {
    x: minX,
    y: minY,
    w: Math.max(...cards.map((c) => c.x + c.w)) - minX,
    h: Math.max(...cards.map((c) => c.y + c.h)) - minY,
  };
}

/** How far to shift cards so the middle of their bounds lands on the middle
 *  of the default view (zoom 1, pan 0 — what "reset view" shows), which in
 *  world coordinates is half the viewport size. */
export function shiftToDefaultViewCenter(bounds: Rect, viewport: ViewportSize): Point {
  return { x: viewport.w / 2 - (bounds.x + bounds.w / 2), y: viewport.h / 2 - (bounds.y + bounds.h / 2) };
}

/** Screen px at each edge that something else covers (toolbars, search box,
 *  minimap); the fit is centered in the space left over. */
export interface ViewInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** The view that shows all of `bounds` (with `padding` screen px around it),
 *  centered in the viewport minus `insets`. Zoom is clamped to `[minZoom, maxZoom]`, so a very large board
 *  may still overflow at `minZoom` and a tiny one isn't blown up past
 *  `maxZoom`. */
export function viewFittingRect(
  bounds: Rect,
  viewport: ViewportSize,
  padding: number,
  minZoom: number,
  maxZoom: number,
  insets: ViewInsets = {},
): ViewState {
  const { top = 0, right = 0, bottom = 0, left = 0 } = insets;
  const visibleWidth = viewport.w - left - right;
  const visibleHeight = viewport.h - top - bottom;
  const fit = Math.min((visibleWidth - 2 * padding) / bounds.w, (visibleHeight - 2 * padding) / bounds.h);
  const zoom = Math.min(maxZoom, Math.max(minZoom, fit));
  return {
    zoom,
    pan: {
      x: left + visibleWidth / 2 - (bounds.x + bounds.w / 2) * zoom,
      y: top + visibleHeight / 2 - (bounds.y + bounds.h / 2) * zoom,
    },
  };
}
