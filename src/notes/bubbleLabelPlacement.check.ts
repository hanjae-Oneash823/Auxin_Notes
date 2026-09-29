// Run: npx tsx src/notes/bubbleLabelPlacement.check.ts — asserts the label placement rules.
import { placeLabels, type Circle, type LabelRequest } from './bubbleLabelPlacement';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const bounds = { width: 400, height: 300 };
const request = (index: number, dot: Circle): LabelRequest => ({ index, dot, width: 80, height: 16 });

// A lone dot in open space: label sits right beside it, no leader.
const lone: Circle = { x: 100, y: 100, r: 6 };
const single = placeLabels([request(0, lone)], [lone], bounds, 3);
assert(single.get(0)?.hasLeader === false, 'lone dot should get an adjacent label');
// First choice: to the right, with the box's left edge on the dot's center.
assert(single.get(0)?.x === lone.x + 40 && single.get(0)?.y === lone.y, 'box starts at the dot center');

// Two nearby dots: both labelled, boxes don't overlap each other or any dot.
const a: Circle = { x: 100, y: 100, r: 6 };
const b: Circle = { x: 130, y: 100, r: 6 };
const pair = placeLabels([request(0, a), request(1, b)], [a, b], bounds, 3);
assert(pair.size === 2, 'both dots should be labelled');
const [pa, pb] = [pair.get(0)!, pair.get(1)!];
const overlapX = Math.abs(pa.x - pb.x) < 80 + 1.5;
const overlapY = Math.abs(pa.y - pb.y) < 16 + 1.5;
assert(!(overlapX && overlapY), 'labels must not overlap');
// A label may sit under its own dot, but never covers another one.
for (const [placement, other] of [[pa, b], [pb, a]] as const) {
  const nearestX = Math.max(placement.x - 40, Math.min(other.x, placement.x + 40));
  const nearestY = Math.max(placement.y - 8, Math.min(other.y, placement.y + 8));
  assert(Math.hypot(other.x - nearestX, other.y - nearestY) >= other.r, "a label covers another note's dot");
}

// No room anywhere: the label is dropped rather than overlapping.
const tight = placeLabels([request(0, lone)], [lone], { width: 60, height: 20 }, 3);
assert(tight.size === 0, 'a label that fits nowhere is omitted');

// Priority: the first request wins the nearest spot when both want it.
const first = placeLabels([request(1, b), request(0, a)], [a, b], bounds, 3);
assert(first.get(1)?.hasLeader === false, 'first request is placed first');

console.log('bubble label placement checks ok');
