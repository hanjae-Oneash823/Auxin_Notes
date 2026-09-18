import type { CrossbarShape } from './arrowPath';

const LANE_GAP = 16;
/** How close (px) two crossbars' natural, unoffset coordinates have to be
 *  — with overlapping spans, on the same axis — before they're treated as
 *  "the same corridor" and separated. Wide enough to catch the case a
 *  random per-arrow offset couldn't reliably avoid (two crossbars landing
 *  within a few px of each other by chance), without roping in crossbars
 *  that only coincidentally share an axis from opposite sides of the board. */
const CONFLICT_THRESHOLD = 40;

function findRoot(parent: Map<string, string>, id: string): string {
  let root = id;
  while (parent.get(root) !== root) root = parent.get(root)!;
  return root;
}

function union(parent: Map<string, string>, a: string, b: string): void {
  const rootA = findRoot(parent, a);
  const rootB = findRoot(parent, b);
  if (rootA !== rootB) parent.set(rootA, rootB);
}

/**
 * Groups arrows into "conflict clusters" — arrows whose crossbars share an
 * axis, land within `CONFLICT_THRESHOLD` px of each other, and have
 * overlapping spans, so their routes would otherwise run parallel and
 * (near-)overlapping through the same corridor — via union-find, then
 * spaces each cluster's members `LANE_GAP` px apart, sorted by id so the
 * assignment is deterministic across renders. An arrow with no conflicts
 * gets offset 0, so the common case (nothing nearby) stays at its natural,
 * centered position.
 */
export function assignArrowLanes(shapes: ReadonlyMap<string, CrossbarShape>): Map<string, number> {
  const ids = [...shapes.keys()];
  const parent = new Map<string, string>(ids.map((id) => [id, id]));

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = shapes.get(ids[i])!;
      const b = shapes.get(ids[j])!;
      if (a.axis !== b.axis) continue;
      if (Math.abs(a.coord - b.coord) > CONFLICT_THRESHOLD) continue;
      if (a.hi < b.lo || b.hi < a.lo) continue;
      union(parent, ids[i], ids[j]);
    }
  }

  const clusters = new Map<string, string[]>();
  for (const id of ids) {
    const root = findRoot(parent, id);
    const members = clusters.get(root) ?? [];
    members.push(id);
    clusters.set(root, members);
  }

  const offsets = new Map<string, number>();
  for (const members of clusters.values()) {
    const sorted = [...members].sort();
    sorted.forEach((id, index) => {
      offsets.set(id, (index - (sorted.length - 1) / 2) * LANE_GAP);
    });
  }
  return offsets;
}
