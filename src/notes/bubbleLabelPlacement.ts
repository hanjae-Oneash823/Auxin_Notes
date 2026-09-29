/** Collision-aware label placement for the full bubble navigator: each note
 *  dot gets a text box beside it, in the first free spot found, with a leader
 *  line when it had to move away from the dot. A label with no free spot is
 *  left out (the dot still shows its full title on hover). Pure geometry, no
 *  DOM — all coordinates are in the chart's own units. */

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface LabelRequest {
  /** Caller's key, echoed back in the result. */
  index: number;
  dot: Circle;
  width: number;
  height: number;
}

export interface LabelPlacement {
  /** Center of the label box. */
  x: number;
  y: number;
  /** True when the box sits clear of its dot (not starting at its center), so a
   *  line should connect them. */
  hasLeader: boolean;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How many progressively farther rings of candidate spots to try. */
const MAX_RINGS = 4;
/** Extra distance per ring, as a multiple of the label's height. */
const RING_STEP = 1.1;
const DIAGONAL_INSET = 0.7;
/** Keeps labels this far from each other and from dots. */
const CLEARANCE = 1.5;

function rectOverlapsCircle(rect: Rect, circle: Circle): boolean {
  const nearestX = Math.max(rect.x - rect.width / 2, Math.min(circle.x, rect.x + rect.width / 2));
  const nearestY = Math.max(rect.y - rect.height / 2, Math.min(circle.y, rect.y + rect.height / 2));
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.r + CLEARANCE;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + CLEARANCE &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + CLEARANCE
  );
}

function isInside(rect: Rect, bounds: { width: number; height: number }): boolean {
  return (
    rect.x - rect.width / 2 >= 0 &&
    rect.y - rect.height / 2 >= 0 &&
    rect.x + rect.width / 2 <= bounds.width &&
    rect.y + rect.height / 2 <= bounds.height
  );
}

/** Candidate box centers around `dot`, nearest first: at each ring the four
 *  sides (right, left, below, above), then the four diagonals. Ring 0 starts
 *  the box at the dot's center (its edge, or corner for the diagonals, on the
 *  center) so the dot sits over the box's end; farther rings sit clear of the
 *  dot, past `gap`, and get a leader line. */
function candidates(request: LabelRequest, gap: number): { x: number; y: number; ring: number }[] {
  const { dot, width, height } = request;
  const spots: { x: number; y: number; ring: number }[] = [];
  for (let ring = 0; ring < MAX_RINGS; ring++) {
    const extra = (ring - 1) * height * RING_STEP;
    const sideDistance = ring === 0 ? 0 : dot.r + gap + extra;
    const diagDistance = ring === 0 ? 0 : dot.r * DIAGONAL_INSET + gap + extra;
    const sideX = sideDistance + width / 2;
    const sideY = sideDistance + height / 2;
    const diagX = diagDistance + width / 2;
    const diagY = diagDistance + height / 2;
    spots.push(
      { x: dot.x + sideX, y: dot.y, ring },
      { x: dot.x - sideX, y: dot.y, ring },
      { x: dot.x, y: dot.y + sideY, ring },
      { x: dot.x, y: dot.y - sideY, ring },
      { x: dot.x + diagX, y: dot.y + diagY, ring },
      { x: dot.x - diagX, y: dot.y + diagY, ring },
      { x: dot.x + diagX, y: dot.y - diagY, ring },
      { x: dot.x - diagX, y: dot.y - diagY, ring },
    );
  }
  return spots;
}

/** Places labels in `requests` order — earlier requests get the nearest free
 *  spots, so pass the most important first. `obstacles` are every circle
 *  that's drawn (folder bubbles and all note dots); a label may not cover one. */
export function placeLabels(
  requests: LabelRequest[],
  obstacles: Circle[],
  bounds: { width: number; height: number },
  gap: number,
): Map<number, LabelPlacement> {
  const placements = new Map<number, LabelPlacement>();
  const placed: Rect[] = [];
  for (const request of requests) {
    for (const spot of candidates(request, gap)) {
      const rect: Rect = { x: spot.x, y: spot.y, width: request.width, height: request.height };
      if (!isInside(rect, bounds)) continue;
      // Its own dot is allowed: ring 0 deliberately starts under it.
      if (obstacles.some((circle) => circle !== request.dot && rectOverlapsCircle(rect, circle))) continue;
      if (placed.some((other) => rectsOverlap(rect, other))) continue;
      placed.push(rect);
      placements.set(request.index, { x: spot.x, y: spot.y, hasLeader: spot.ring > 0 });
      break;
    }
  }
  return placements;
}
