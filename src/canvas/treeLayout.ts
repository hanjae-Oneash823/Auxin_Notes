import type { Point } from './canvasGeometry';
import type { LayoutArrow, LayoutCard } from './optimizeLayout';

/** Clear space between one row and the next, before any arrow label's height. */
const ROW_GAP_PX = 90;
/** Clear space between neighbours in a row. */
const COLUMN_GAP_PX = 48;

/** Splits `ids` into layers so every arrow points from a layer to a later one:
 *  a card sits one row below its lowest parent. An arrow that would close a
 *  cycle is ignored. */
export function assignLayers(ids: readonly string[], edges: readonly [string, string][]): Map<string, number> {
  const children = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [from, to] of edges) children.get(from)?.push(to);

  const order: string[] = [];
  const state = new Map<string, 'open' | 'done'>();
  const backEdges = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 'open');
    for (const child of children.get(id) ?? []) {
      if (state.get(child) === 'open') backEdges.add(`${id}>${child}`);
      else if (!state.has(child)) visit(child);
    }
    state.set(id, 'done');
    order.push(id);
  };
  for (const id of ids) if (!state.has(id)) visit(id);

  const layers = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const id of order.reverse()) {
    for (const child of children.get(id) ?? []) {
      if (!backEdges.has(`${id}>${child}`)) layers.set(child, Math.max(layers.get(child) ?? 0, (layers.get(id) ?? 0) + 1));
    }
  }
  return layers;
}

/** Lays the movable cards out as a top-down tree: arrows run downward, each
 *  row sits under its parents (a card with several parents centers under
 *  them), and the result stays centered where the cards were. Rows keep the
 *  cards' current left-to-right order. `direction: 'right'` runs the arrows left
 *  to right instead, with columns for rows. Arrows to pinned cards are ignored.
 *  Pure: returns a new top-left per movable card. */
export function treeLayout(
  cards: readonly LayoutCard[],
  arrows: readonly LayoutArrow[],
  movableIds?: ReadonlySet<string>,
  direction: 'down' | 'right' = 'down',
): Map<string, Point> {
  if (direction === 'down') return layoutRowsDown(cards, arrows, movableIds);
  // Left to right is the top-down tree on the transposed board.
  const flip = (c: LayoutCard): LayoutCard => ({ id: c.id, x: c.y, y: c.x, w: c.h, h: c.w });
  const flippedArrows = arrows.map((a) => (a.label ? { ...a, label: { w: a.label.h, h: a.label.w } } : a));
  const placed = layoutRowsDown(cards.map(flip), flippedArrows, movableIds);
  return new Map([...placed].map(([id, p]) => [id, { x: p.y, y: p.x }]));
}

function layoutRowsDown(
  cards: readonly LayoutCard[],
  arrows: readonly LayoutArrow[],
  movableIds?: ReadonlySet<string>,
): Map<string, Point> {
  const movers = cards.filter((c) => !movableIds || movableIds.has(c.id));
  if (movers.length === 0) return new Map();
  const byId = new Map(movers.map((c) => [c.id, c]));
  const center = (c: LayoutCard) => c.x + c.w / 2;

  const edges = arrows
    .filter((a) => a.fromCardId !== a.toCardId && byId.has(a.fromCardId) && byId.has(a.toCardId))
    .map((a): [string, string] => [a.fromCardId, a.toCardId]);
  const sorted = [...movers].sort((a, b) => a.y - b.y || a.x - b.x).map((c) => c.id);
  const layers = assignLayers(sorted, edges);
  const parents = new Map<string, string[]>(sorted.map((id) => [id, []]));
  for (const [from, to] of edges) if ((layers.get(from) ?? 0) < (layers.get(to) ?? 0)) parents.get(to)?.push(from);

  const rowCount = Math.max(...layers.values()) + 1;
  const rows = Array.from({ length: rowCount }, (_, row) => movers.filter((c) => layers.get(c.id) === row));
  const labelHeightInto = (row: readonly LayoutCard[]) =>
    Math.max(0, ...arrows.filter((a) => a.label && row.some((c) => c.id === a.toCardId)).map((a) => a.label!.h));

  const placed = new Map<string, Point>();
  const centers = new Map<string, number>();
  let top = 0;
  rows.forEach((row, rowIndex) => {
    const wanted = new Map(
      row.map((c) => {
        const above = (parents.get(c.id) ?? []).map((p) => centers.get(p)!);
        return [c.id, above.length > 0 ? above.reduce((sum, x) => sum + x, 0) / above.length : center(c)] as const;
      }),
    );
    const ordered = [...row].sort((a, b) => wanted.get(a.id)! - wanted.get(b.id)! || center(a) - center(b));
    // Pack left to right without overlap, then slide the row back over where its cards wanted to be.
    let right = -Infinity;
    const xs = ordered.map((c) => {
      const x = Math.max(wanted.get(c.id)!, right + COLUMN_GAP_PX + c.w / 2);
      right = x + c.w / 2;
      return x;
    });
    const drift = ordered.reduce((sum, c, i) => sum + xs[i] - wanted.get(c.id)!, 0) / ordered.length;
    if (rowIndex > 0) top += ROW_GAP_PX + labelHeightInto(row);
    ordered.forEach((c, i) => {
      centers.set(c.id, xs[i] - drift);
      placed.set(c.id, { x: xs[i] - drift - c.w / 2, y: top });
    });
    top += Math.max(...row.map((c) => c.h));
  });

  // Keep the block where it was: match the old and new bounding-box centers.
  const box = (points: { x: number; y: number; w: number; h: number }[]) => {
    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    return { x: (minX + Math.max(...points.map((p) => p.x + p.w))) / 2, y: (minY + Math.max(...points.map((p) => p.y + p.h))) / 2 };
  };
  const before = box(movers);
  const after = box(movers.map((c) => ({ ...placed.get(c.id)!, w: c.w, h: c.h })));
  const dx = before.x - after.x;
  const dy = before.y - after.y;
  return new Map([...placed].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]));
}
