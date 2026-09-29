import type { Point, Rect } from './canvasGeometry';

/** Clear space kept between cards when rotating leaves their boxes touching. */
const CLEARANCE_PX = 16;
const MAX_SEPARATION_PASSES = 60;

interface RotatableCard extends Rect {
  id: string;
}

/** Rotates the movable cards' positions clockwise by `degrees` around the
 *  average of their centers. Each card keeps its own orientation and
 *  size, so text stays upright. Wide cards' boxes can overlap once their
 *  centers swing round, so overlaps are then pushed apart (movable cards
 *  give way; pinned ones never move). Returns a new top-left per movable card. */
export function rotatePositions(
  cards: readonly RotatableCard[],
  degrees: number,
  movableIds?: ReadonlySet<string>,
): Map<string, Point> {
  const isMovable = (card: RotatableCard) => !movableIds || movableIds.has(card.id);
  const movers = cards.filter(isMovable);
  if (movers.length === 0) return new Map();

  // The average of the centers, not the middle of the cards' bounding box:
  // the average is unchanged by a rotation, so turning +30° then -30° lands
  // every card back where it started (the bounding box shifts as it turns).
  const pivot = {
    x: movers.reduce((sum, card) => sum + card.x + card.w / 2, 0) / movers.length,
    y: movers.reduce((sum, card) => sum + card.y + card.h / 2, 0) / movers.length,
  };
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // On screen y points down, so this matrix turns clockwise.
  const placed = cards.map((card) => {
    if (!isMovable(card)) return { ...card };
    const dx = card.x + card.w / 2 - pivot.x;
    const dy = card.y + card.h / 2 - pivot.y;
    return { ...card, x: pivot.x + dx * cos - dy * sin - card.w / 2, y: pivot.y + dx * sin + dy * cos - card.h / 2 };
  });

  separateOverlaps(placed, isMovable);
  return new Map(placed.filter(isMovable).map((card) => [card.id, { x: card.x, y: card.y }]));
}

/** Pushes overlapping boxes apart along whichever axis needs the least
 *  movement, in place, until none overlap (or the pass limit). */
function separateOverlaps(cards: RotatableCard[], isMovable: (card: RotatableCard) => boolean): void {
  for (let pass = 0; pass < MAX_SEPARATION_PASSES; pass++) {
    let hasOverlap = false;
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i];
        const b = cards[j];
        const overlapX = Math.min(a.x + a.w + CLEARANCE_PX - b.x, b.x + b.w + CLEARANCE_PX - a.x);
        const overlapY = Math.min(a.y + a.h + CLEARANCE_PX - b.y, b.y + b.h + CLEARANCE_PX - a.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const shareOfA = isMovable(a) ? (isMovable(b) ? 0.5 : 1) : 0;
        if (shareOfA === 0 && !isMovable(b)) continue;
        hasOverlap = true;
        const isPushingAlongX = overlapX < overlapY;
        const direction = isPushingAlongX ? Math.sign(a.x + a.w / 2 - (b.x + b.w / 2)) || 1 : Math.sign(a.y + a.h / 2 - (b.y + b.h / 2)) || 1;
        const distance = isPushingAlongX ? overlapX : overlapY;
        const axis = isPushingAlongX ? 'x' : 'y';
        a[axis] += direction * distance * shareOfA;
        b[axis] -= direction * distance * (1 - shareOfA);
      }
    }
    if (!hasOverlap) return;
  }
}
