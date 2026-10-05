// Runnable check for the field view's grid and physics: `node --experimental-strip-types src/planner/field/fieldPhysics.check.ts`
import type { PlannerNode } from '../../db/queries/planner/types.ts';
import { offsetDateKey } from '../nodeDerived.ts';
import { bandAt, bucketColumn, buildColumns, columnAt, homeYFor, rowAt, rowBoundaries, syncParticles, tick, TOP_BOUND, type FieldParticle } from './fieldPhysics.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`fieldPhysics check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

function ok(condition: boolean, message: string): void {
  if (!condition) throw new Error(`fieldPhysics check failed: ${message}`);
}

const node = (partial: Partial<PlannerNode>): PlannerNode => ({
  id: 'n', projectId: null, arcId: null, title: 'Node', nodeType: 'task', pool: 'hot', plannedStartAt: null, dueAt: null,
  actualCompletedAt: null, estimatedDurationMinutes: null, importanceLevel: 0, isCompleted: false, isLocked: false, isPinned: false,
  isFrogPinned: false, isRoutine: false, routineId: null, createdAt: '', updatedAt: '', groupIds: [], subTotal: 0, subDone: 0,
  ...partial,
});

// Columns: today first, five more days, with OOPS in front only when something is overdue.
const plain = buildColumns(0, false);
equal(plain.length, 6, 'today plus five days');
equal([plain[0].label, plain[0].key, plain[0].isToday], ['TODAY', offsetDateKey(0), true], 'first column is today');
equal(plain.map((column) => column.key), [0, 1, 2, 3, 4, 5].map((days) => offsetDateKey(days)), 'consecutive days');
equal(buildColumns(0, true)[0].label, 'OOPS', 'OOPS column leads when needed');
equal(buildColumns(0, true).length, 7, 'OOPS adds a column');
equal(buildColumns(5, false).map((column) => column.key), [0, 6, 7, 8, 9, 10].map((days) => offsetDateKey(days)), 'paging keeps today and slides the rest');
ok(/^\d\d\/\d\d$/.test(plain[1].dateLabel), 'date label is MM/DD');

// Which column a node lands in.
const withOops = buildColumns(0, true);
equal(bucketColumn(node({ plannedStartAt: offsetDateKey(0) }), withOops), 1, 'planned today');
equal(bucketColumn(node({ plannedStartAt: `${offsetDateKey(2)}T09:30:00` }), withOops), 3, 'a timed node uses its date');
equal(bucketColumn(node({ dueAt: offsetDateKey(1) }), withOops), 2, 'no planned day: the due date');
equal(bucketColumn(node({ plannedStartAt: offsetDateKey(20) }), withOops), null, 'outside the window');
equal(bucketColumn(node({}), withOops), null, 'no date at all');
equal(bucketColumn(node({ plannedStartAt: offsetDateKey(-3) }), withOops), 0, 'a missed day goes to OOPS');
equal(bucketColumn(node({ dueAt: offsetDateKey(-1) }), withOops), 0, 'an overdue deadline goes to OOPS');
equal(bucketColumn(node({ dueAt: offsetDateKey(-1) }), plain), null, 'overdue with no OOPS column is not shown');

// Rows: important on top, then normal, then events; the three boundaries are ordered.
const H = 500;
const rows = rowBoundaries(H);
ok(rows.topBound < rows.importantBoundary && rows.importantBoundary < rows.normalBoundary && rows.normalBoundary < rows.bottomBound, 'row boundaries are in order');
equal([bandAt(rows.topBound + 1, H), bandAt(rows.importantBoundary + 1, H), bandAt(rows.normalBoundary + 1, H)], [1, 0, null], 'bands: important, normal, none over events');
equal([rowAt(rows.topBound + 1, H), rowAt(rows.importantBoundary + 1, H), rowAt(rows.normalBoundary + 1, H)], [1, 0, 2], 'hover rows');
ok(homeYFor(node({ importanceLevel: 1 }), H, 0) < homeYFor(node({ importanceLevel: 0 }), H, 0), 'important sits above normal');
ok(homeYFor(node({ nodeType: 'event', importanceLevel: 1 }), H, 0) > rows.normalBoundary, 'events ignore importance and sit in their own row');
equal([columnAt(-5, 600, 6), columnAt(0, 600, 6), columnAt(199, 600, 6), columnAt(599, 600, 6), columnAt(900, 600, 6)], [0, 0, 1, 5, 5], 'x to column, clamped');

// Particles: open nodes in the window only; kept across updates; dropped when they leave.
const particles = new Map<string, FieldParticle>();
const nodes = [
  node({ id: 'a', plannedStartAt: offsetDateKey(0) }),
  node({ id: 'b', plannedStartAt: offsetDateKey(1), isCompleted: true }),
  node({ id: 'c', plannedStartAt: offsetDateKey(40) }),
];
syncParticles(particles, nodes, plain, 600, H);
equal(Array.from(particles.keys()), ['a'], 'completed and out-of-window nodes are not shown');
const seeded = particles.get('a');
syncParticles(particles, [node({ id: 'a', plannedStartAt: offsetDateKey(0), title: 'Renamed' })], plain, 600, H);
ok(particles.get('a') === seeded && seeded?.node.title === 'Renamed', 'an existing particle keeps its motion and gets the new node');
syncParticles(particles, [node({ id: 'a', plannedStartAt: offsetDateKey(3) })], plain, 600, H);
equal(particles.get('a')?.column, 3, 'rescheduling moves its column');
syncParticles(particles, [], plain, 600, H);
equal(particles.size, 0, 'removed nodes are dropped');

// Physics: a dot settles in its cell, and stays inside the canvas.
const settle = new Map<string, FieldParticle>();
syncParticles(settle, [node({ id: 'x', plannedStartAt: offsetDateKey(2), importanceLevel: 1 })], plain, 600, H);
const dot = settle.get('x')!;
for (let frame = 0; frame < 600; frame++) tick([dot], plain.length, [], null, 600, H, true, frame * 16);
const cellStart = (600 / 6) * 2;
ok(dot.x > cellStart && dot.x < cellStart + 100, `settles inside its column (x=${dot.x.toFixed(1)})`);
ok(dot.y >= TOP_BOUND && dot.y < rows.importantBoundary, `settles in the important row (y=${dot.y.toFixed(1)})`);

// A crowded cell: five long-titled nodes planned for today spread out so no dot's label overlaps another's,
// and every dot stays inside its row and inside the canvas, even in the leftmost column.
const crowd = new Map<string, FieldParticle>();
const titles = ['migrate mycelium into Auxin', 'plan and study', 'FGL-G&L 1-2주차 내용 정리', '생활비 정리', 'QBIOlab winter internship'];
const crowded = titles.map((title, index) => node({ id: `c${index}`, title, plannedStartAt: offsetDateKey(0) }));
const W = 980;
const crowdColumns = buildColumns(0, false);
syncParticles(crowd, crowded, crowdColumns, W, H);
const crowdList = Array.from(crowd.values());
for (let frame = 0; frame < 1500; frame++) tick(crowdList, crowdColumns.length, [], null, W, H, true, frame * 16);
const halfWidthOf = (title: string) => Math.max(10, Math.min(136, title.length * 6.4 + 16) / 2);
const FOOTPRINT_HEIGHT = 45;
const SLACK = 4; // the soft repulsion leaves a few pixels of give
for (let i = 0; i < crowdList.length; i++) {
  for (let j = i + 1; j < crowdList.length; j++) {
    const a = crowdList[i];
    const b = crowdList[j];
    const separatedX = Math.abs(a.x - b.x) >= halfWidthOf(a.node.title) + halfWidthOf(b.node.title) - SLACK;
    const separatedY = Math.abs(a.y - b.y) >= FOOTPRINT_HEIGHT - SLACK;
    ok(separatedX || separatedY, `labels of "${a.node.title}" and "${b.node.title}" overlap (dx=${(a.x - b.x).toFixed(0)}, dy=${(a.y - b.y).toFixed(0)})`);
  }
}
for (const particle of crowdList) {
  ok(particle.x - halfWidthOf(particle.node.title) >= 0 && particle.x + halfWidthOf(particle.node.title) <= W, `"${particle.node.title}" stays inside the canvas (x=${particle.x.toFixed(0)})`);
  ok(particle.y > rows.importantBoundary && particle.y < rows.normalBoundary, `"${particle.node.title}" stays in the normal row (y=${particle.y.toFixed(0)})`);
}

console.log('fieldPhysics: ok');
