import type { Point, Rect } from './canvasGeometry';
import { rectCenter } from './canvasGeometry';

/** Gap (px) between parallel arrows that join the same two cards. */
const PARALLEL_ARROW_SPACING = 16;
/** Arrow endpoints stay this far inside a card's edge. */
const ENDPOINT_MARGIN = 4;

export interface ArrowCard extends Rect {
  id: string;
}

export interface ArrowLink {
  id: string;
  fromCardId: string;
  toCardId: string;
}

/** An arrow with its two cards resolved and its endpoints chosen — inside
 *  each card, at its center unless nudged off to keep this arrow parallel to
 *  others joining the same pair. */
export interface PlannedArrow {
  id: string;
  from: ArrowCard;
  to: ArrowCard;
  start: Point;
  end: Point;
}

function clampInto(rect: Rect, point: Point): Point {
  return {
    x: Math.min(Math.max(point.x, rect.x + ENDPOINT_MARGIN), rect.x + rect.w - ENDPOINT_MARGIN),
    y: Math.min(Math.max(point.y, rect.y + ENDPOINT_MARGIN), rect.y + rect.h - ENDPOINT_MARGIN),
  };
}

/**
 * Resolves each arrow's cards and picks its endpoints. Both ends sit at their
 * card's center — the router then finds a path between them and the route is
 * clipped to the card edges (`clipRoute`), so arrows leave a card wherever the
 * line between the cards crosses its edge, spreading out on their own.
 *
 * Arrows joining the same two cards (say A→B and B→A) would lie exactly on top
 * of each other, so those are shifted sideways, by the same amount at both
 * ends, into parallel lines. Arrows to a missing card, or from a card to
 * itself, are dropped.
 */
export function planArrows(cards: readonly ArrowCard[], arrows: readonly ArrowLink[]): PlannedArrow[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const resolved = arrows.flatMap((arrow) => {
    const from = cardsById.get(arrow.fromCardId);
    const to = cardsById.get(arrow.toCardId);
    return from && to && from.id !== to.id ? [{ id: arrow.id, from, to }] : [];
  });

  const pairKey = (from: ArrowCard, to: ArrowCard) => (from.id < to.id ? `${from.id}|${to.id}` : `${to.id}|${from.id}`);
  const groups = new Map<string, string[]>();
  for (const { id, from, to } of resolved) {
    const key = pairKey(from, to);
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }

  return resolved.map(({ id, from, to }) => {
    const group = [...groups.get(pairKey(from, to))!].sort();
    const offset = (group.indexOf(id) - (group.length - 1) / 2) * PARALLEL_ARROW_SPACING;

    // "Sideways" is measured against one fixed direction for the pair (lower
    // id to higher), so A→B and B→A shift the same way and stay parallel.
    const [first, second] = from.id < to.id ? [from, to] : [to, from];
    const a = rectCenter(first);
    const b = rectCenter(second);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const sideways = { x: (-(b.y - a.y) / length) * offset, y: ((b.x - a.x) / length) * offset };
    const nudge = (rect: Rect): Point => {
      const center = rectCenter(rect);
      return clampInto(rect, { x: center.x + sideways.x, y: center.y + sideways.y });
    };
    return { id, from, to, start: nudge(from), end: nudge(to) };
  });
}

/** Where the ray from `inside` (a point within `rect`) toward `toward` leaves `rect`. */
export function exitPoint(rect: Rect, inside: Point, toward: Point): Point {
  const dx = toward.x - inside.x;
  const dy = toward.y - inside.y;
  if (dx === 0 && dy === 0) return inside;
  const tx = dx > 0 ? (rect.x + rect.w - inside.x) / dx : dx < 0 ? (rect.x - inside.x) / dx : Infinity;
  const ty = dy > 0 ? (rect.y + rect.h - inside.y) / dy : dy < 0 ? (rect.y - inside.y) / dy : Infinity;
  const t = Math.min(tx, ty);
  return { x: inside.x + dx * t, y: inside.y + dy * t };
}

/** An arrow meets a card at least this far (px) from either corner of its
 *  edge — a quarter of the edge on a small card. */
const CORNER_MARGIN = 24;

/** Length (px) of the straight stub where an arrow meets a card, square to its edge. */
const PERPENDICULAR_STUB = 24;
/** A stub never takes more than this share of the run to the next point, so
 *  two stubs on a short arrow can't overlap. */
const STUB_MAX_SHARE = 1 / 3;

/** The unit vector pointing straight out of the side of `rect` that `edgePoint` lies on. */
function outwardNormal(rect: Rect, edgePoint: Point): Point {
  const sides: [Point, number][] = [
    [{ x: -1, y: 0 }, Math.abs(edgePoint.x - rect.x)],
    [{ x: 1, y: 0 }, Math.abs(edgePoint.x - (rect.x + rect.w))],
    [{ x: 0, y: -1 }, Math.abs(edgePoint.y - rect.y)],
    [{ x: 0, y: 1 }, Math.abs(edgePoint.y - (rect.y + rect.h))],
  ];
  return sides.reduce((nearest, side) => (side[1] < nearest[1] ? side : nearest))[0];
}

/** `edgePoint` slid along its edge, if needed, to sit `CORNER_MARGIN` clear of
 *  the corners — so an arrow crossing near a corner meets the card mid-edge
 *  instead of hugging it. */
function awayFromCorners(rect: Rect, edgePoint: Point): Point {
  const normal = outwardNormal(rect, edgePoint);
  const clampAlong = (value: number, lo: number, length: number) => {
    const margin = Math.min(CORNER_MARGIN, length / 4);
    return Math.min(Math.max(value, lo + margin), lo + length - margin);
  };
  return normal.x !== 0
    ? { x: edgePoint.x, y: clampAlong(edgePoint.y, rect.y, rect.h) }
    : { x: clampAlong(edgePoint.x, rect.x, rect.w), y: edgePoint.y };
}

/** A point a short way straight out from `edgePoint`, square to `rect`'s side —
 *  where the arrow turns from its perpendicular stub toward `toward`. */
function stubPoint(rect: Rect, edgePoint: Point, toward: Point): Point {
  const normal = outwardNormal(rect, edgePoint);
  const length = Math.min(PERPENDICULAR_STUB, Math.hypot(toward.x - edgePoint.x, toward.y - edgePoint.y) * STUB_MAX_SHARE);
  return { x: edgePoint.x + normal.x * length, y: edgePoint.y + normal.y * length };
}

/** Trims a route that runs center to center so it starts on `from`'s edge and
 *  ends on `to`'s, aimed along its first and last segments (kept off the
 *  corners, see `awayFromCorners`) — then adds a short
 *  stub at each end that leaves (or enters) the card square to its edge, so an
 *  arrow always meets a card head-on however it then bends toward its target. */
export function clipRoute(route: readonly Point[], from: Rect, to: Rect): Point[] {
  if (route.length < 2) return [...route];
  const start = awayFromCorners(from, exitPoint(from, route[0], route[1]));
  const end = awayFromCorners(to, exitPoint(to, route[route.length - 1], route[route.length - 2]));
  // Stubs are sized against where the arrow actually goes next — for a single
  // straight run that's its other end on the far card's edge, not that card's
  // (much farther) center.
  const isSingleRun = route.length === 2;
  const startStub = stubPoint(from, start, isSingleRun ? end : route[1]);
  const endStub = stubPoint(to, end, isSingleRun ? start : route[route.length - 2]);
  return [start, startStub, ...route.slice(1, -1), endStub, end];
}
