import type { Point } from './canvasGeometry';
import type { LayoutArrow, LayoutCard } from './optimizeLayout';
import { assignLayers } from './treeLayout';

/** Clear space between one ring and the next. */
const RING_GAP_PX = 70;
/** Clear space between neighbours on a ring. */
const ARC_GAP_PX = 40;
const VIRTUAL_ROOT = '\0root';

/** Lays the movable cards out on rings around the arrows' starting card: each
 *  card sits one ring out from its parent, in a wedge sized by how many cards
 *  hang off it. Several starting cards share the first ring around an empty
 *  center. Arrows to pinned cards are ignored, and the result stays centered
 *  where the cards were. Pure: returns a new top-left per movable card. */
export function radialLayout(
  cards: readonly LayoutCard[],
  arrows: readonly LayoutArrow[],
  movableIds?: ReadonlySet<string>,
): Map<string, Point> {
  const movers = cards.filter((c) => !movableIds || movableIds.has(c.id));
  if (movers.length === 0) return new Map();
  const byId = new Map(movers.map((c) => [c.id, c]));

  const edges = arrows
    .filter((a) => a.fromCardId !== a.toCardId && byId.has(a.fromCardId) && byId.has(a.toCardId))
    .map((a): [string, string] => [a.fromCardId, a.toCardId]);
  const sorted = [...movers].sort((a, b) => a.y - b.y || a.x - b.x).map((c) => c.id);
  const layers = assignLayers(sorted, edges);

  // Each card hangs off one parent from the ring just inside it.
  const children = new Map<string, string[]>([[VIRTUAL_ROOT, []], ...sorted.map((id) => [id, []] as [string, string[]])]);
  const hasParent = new Set<string>();
  for (const [from, to] of edges) {
    if ((layers.get(from) ?? 0) + 1 === layers.get(to) && !hasParent.has(to)) {
      hasParent.add(to);
      children.get(from)!.push(to);
    }
  }
  const roots = sorted.filter((id) => !hasParent.has(id));
  const centerX = (id: string) => byId.get(id)!.x + byId.get(id)!.w / 2;
  // A lone start sits at the center; several share the first ring.
  const top = roots.length === 1 ? roots[0] : VIRTUAL_ROOT;
  children.set(VIRTUAL_ROOT, roots);
  for (const list of children.values()) list.sort((a, b) => centerX(a) - centerX(b));

  const weight = new Map<string, number>();
  const weigh = (id: string): number => {
    const kids = children.get(id) ?? [];
    const w = kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + weigh(kid), 0);
    weight.set(id, w);
    return w;
  };
  weigh(top);

  const ringOf = new Map<string, number>([[top, 0]]);
  const angleOf = new Map<string, number>();
  const rings: string[][] = [];
  const spread = (id: string, from: number, to: number) => {
    angleOf.set(id, (from + to) / 2);
    (rings[ringOf.get(id)!] ??= []).push(id);
    let start = from;
    for (const kid of children.get(id) ?? []) {
      const span = ((to - from) * weight.get(kid)!) / weight.get(id)!;
      ringOf.set(kid, ringOf.get(id)! + 1);
      spread(kid, start, start + span);
      start += span;
    }
  };
  spread(top, -Math.PI / 2, (3 * Math.PI) / 2);

  const size = (id: string) => (id === VIRTUAL_ROOT ? { w: 0, h: 0 } : byId.get(id)!);
  const reach = rings.map((ring) => Math.max(...ring.map((id) => Math.hypot(size(id).w, size(id).h) / 2)));
  const radius: number[] = [0];
  for (let r = 1; r < rings.length; r++) {
    const arcNeeded = rings[r].reduce((sum, id) => sum + Math.max(size(id).w, size(id).h) + ARC_GAP_PX, 0) / (2 * Math.PI);
    radius[r] = Math.max(radius[r - 1] + reach[r - 1] + reach[r] + RING_GAP_PX, arcNeeded);
  }

  const centers = new Map<string, Point>();
  for (const id of sorted) {
    const r = radius[ringOf.get(id)!];
    const angle = angleOf.get(id)!;
    centers.set(id, { x: r * Math.cos(angle), y: r * Math.sin(angle) });
  }

  // Keep the block where it was: match the old and new bounding-box centers.
  const middle = (points: Point[]) => ({
    x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2,
    y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2,
  });
  const before = middle(movers.map((c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 })));
  const after = middle([...centers.values()]);
  return new Map(
    sorted.map((id) => {
      const c = byId.get(id)!;
      const p = centers.get(id)!;
      return [id, { x: p.x + before.x - after.x - c.w / 2, y: p.y + before.y - after.y - c.h / 2 }];
    }),
  );
}
