export const MIN_CARD_WIDTH = 160;
export const MIN_CARD_HEIGHT = 90;
export const DEFAULT_CARD_WIDTH = 240;
export const DEFAULT_CARD_HEIGHT = 140;

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 1.15;

/** Corner radius for `arrowPath.ts`'s orthogonal elbow router — shared by
 *  both `CanvasArrow.tsx` (the committed arrow) and `CanvasView.tsx`'s
 *  in-progress dashed preview, so a drawn-then-released arrow doesn't
 *  visibly change shape the moment it's dropped. */
export const ARROW_CORNER_RADIUS = 12;
