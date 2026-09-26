import type { CanvasCard } from '../vault/canvasTypes';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** Standard AABB overlap test — used by the marquee-select drag
 *  (`CanvasView.tsx`) to find which cards fall inside the dragged rect. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Point where the ray from `rect`'s center toward `toward` crosses `rect`'s
 *  boundary — used as an arrow's start/end point so it touches the card's
 *  edge instead of floating over its middle. Falls back to the center
 *  itself when `toward` sits exactly on it (nothing to aim at). */
export function edgePoint(rect: Rect, toward: Point): Point {
  const center = rectCenter(rect);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;

  const halfW = rect.w / 2;
  const halfH = rect.h / 2;
  // Distance (in units of the dx/dy vector) to reach the rect's vertical
  // edges and horizontal edges; the smaller of the two is the one actually
  // hit first, same test a ray/AABB intersection uses.
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

export type NavDirection = 'up' | 'down' | 'left' | 'right';

const DIRECTION_VECTORS: Record<NavDirection, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** How much a candidate's sideways offset (perpendicular to the requested
 *  direction) counts against it relative to how far ahead it is — higher
 *  favors a card that's directly in line over one that's closer but well
 *  off to the side. Tuned by feel, not derived from anything. */
const OFF_AXIS_PENALTY = 1.6;

/**
 * Picks the best card to move focus to from `fromId` in `direction`, by
 * projecting every other card's center onto the direction vector (must be
 * strictly ahead to qualify) and scoring how far ahead vs. how far off to
 * the side it sits. Returns null when nothing qualifies (nothing that way).
 * Pure and DOM-free so it's testable/tunable in isolation — see the
 * file-searcher's `focusedIndex` model (1D) this generalizes to 2D.
 */
export function pickNearestCard(
  cards: readonly CanvasCard[],
  fromId: string,
  direction: NavDirection,
): string | null {
  const from = cards.find((card) => card.id === fromId);
  if (!from) return null;
  const origin = rectCenter(from);
  const dir = DIRECTION_VECTORS[direction];

  let best: { id: string; score: number } | null = null;
  for (const card of cards) {
    if (card.id === fromId) continue;
    const center = rectCenter(card);
    const vx = center.x - origin.x;
    const vy = center.y - origin.y;
    const primary = vx * dir.x + vy * dir.y;
    if (primary <= 0) continue;
    const perpX = vx - primary * dir.x;
    const perpY = vy - primary * dir.y;
    const secondary = Math.hypot(perpX, perpY);
    const score = primary + secondary * OFF_AXIS_PENALTY;
    if (!best || score < best.score) best = { id: card.id, score };
  }
  return best?.id ?? null;
}

const NEW_CARD_OFFSET_PX = 260;

/** Where Tab+direction (`useCanvasKeyboardNav.ts`) drops a new card relative
 *  to the one it's created from. */
export function offsetPosition(from: Rect, direction: NavDirection): Point {
  const dir = DIRECTION_VECTORS[direction];
  return {
    x: from.x + dir.x * (from.w + NEW_CARD_OFFSET_PX),
    y: from.y + dir.y * (from.h + NEW_CARD_OFFSET_PX),
  };
}
