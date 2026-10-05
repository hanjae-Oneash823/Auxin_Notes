import type { Point, Rect } from './canvasGeometry';

export interface MinimapLayout {
  /** Map pixels per world pixel. */
  scale: number;
  toMapPoint: (world: Point) => Point;
  toMapRect: (world: Rect) => Rect;
  toWorldPoint: (map: Point) => Point;
}

/** Smallest rect containing all of `rects` (which must not be empty). */
export function unionRects(rects: readonly Rect[]): Rect {
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  return {
    x: minX,
    y: minY,
    w: Math.max(...rects.map((r) => r.x + r.w)) - minX,
    h: Math.max(...rects.map((r) => r.y + r.h)) - minY,
  };
}

/** Maps `worldBounds` into a `mapSize` box with `padding` px kept clear all
 *  round, uniformly scaled and centered. */
export function layoutMinimap(worldBounds: Rect, mapSize: { w: number; h: number }, padding: number): MinimapLayout {
  const scale = Math.min(
    (mapSize.w - 2 * padding) / Math.max(worldBounds.w, 1),
    (mapSize.h - 2 * padding) / Math.max(worldBounds.h, 1),
  );
  const offsetX = (mapSize.w - worldBounds.w * scale) / 2 - worldBounds.x * scale;
  const offsetY = (mapSize.h - worldBounds.h * scale) / 2 - worldBounds.y * scale;
  return {
    scale,
    toMapPoint: (p) => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY }),
    toMapRect: (r) => ({ x: r.x * scale + offsetX, y: r.y * scale + offsetY, w: r.w * scale, h: r.h * scale }),
    toWorldPoint: (p) => ({ x: (p.x - offsetX) / scale, y: (p.y - offsetY) / scale }),
  };
}
