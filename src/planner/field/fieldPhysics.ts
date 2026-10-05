import type { PlannerNode } from '../../db/queries/planner/types.ts';
import { isMissed, isOverdue, offsetDateKey, plannedDateOf } from '../nodeDerived.ts';

// Mycelium's "field" view: every open node is a floating dot in a grid of day columns
// (an OOPS column for overdue ones, then today and the next five days) by three rows —
// important, normal and events. The physics here is a port of Mycelium's fieldPhysics.ts.

export type ColumnTone = 'overdue' | 'today' | 'weekday' | 'saturday' | 'sunday';

export interface FieldColumn {
  /** 'YYYY-MM-DD', or 'overdue'. */
  key: string;
  /** 'OOPS' | 'TODAY' | 'MON' … */
  label: string;
  /** 'MM/DD', empty for the OOPS column. */
  dateLabel: string;
  tone: ColumnTone;
  isOverdue: boolean;
  isToday: boolean;
}

export interface FieldParticle {
  node: PlannerNode;
  /** Index into the current columns the node belongs to. */
  column: number;
  x: number; y: number; vx: number; vy: number; fx: number; fy: number;
  opacity: number; scale: number;
  phase: number; jitterFreq: number; yJitter: number;
  /** 1 = label bubble at rest; 0 = collapsed into the dot. Animated by tick() after a launch. */
  labelScale: number;
  /** Timestamp (ms) the current launch's label animation started, or null when at rest. */
  labelAnimStart: number | null;
}

export const TOP_BOUND = 64;
export const BOTTOM_MARGIN = 18;
export const NO_ARC_ID = '__none__';
export const DOT_DIAMETER = 20;
/** The day columns after OOPS: today plus this many more. */
const DAY_COLUMNS = 6;

const RADIUS = DOT_DIAMETER / 2;
const REPEL_K = 0.35;
const SPRING_K = 0.02;
const DAMPING = 0.86;
const EDGE_BOUNCE = -0.3;
const EDGE_PX = 4;

// A particle's footprint is its dot plus the title bubble drawn below it (see fieldRender.ts:
// 12px text, 8px padding each side, 120px max text, centered 15px under the dot's edge, 20px tall).
// tick() has no canvas context to measure text, so the width is a character-count estimate.
const LABEL_CHAR_WIDTH = 6.4;
const LABEL_PAD = 16;
const LABEL_MAX_WIDTH = 136;
const LABEL_HEIGHT = 20;
const LABEL_GAP = 15;
/** Distance from the dot's center to the bottom of its label. */
const FOOTPRINT_BELOW = RADIUS + LABEL_GAP + LABEL_HEIGHT / 2;
const FOOTPRINT_HALF_HEIGHT = (RADIUS + FOOTPRINT_BELOW) / 2;
const FOOTPRINT_PAD = 8;

const footprintHalfWidth = (node: PlannerNode): number => Math.max(RADIUS, Math.min(LABEL_MAX_WIDTH, node.title.length * LABEL_CHAR_WIDTH + LABEL_PAD) / 2);

// A moved node's label shrinks into the dot, stays hidden while the node travels to its new
// home, then expands back out once it arrives.
const LABEL_SHRINK_MS = 150;
const LABEL_HOLD_MS = 250;
const LABEL_EXPAND_MS = 200;
const LABEL_ANIM_TOTAL_MS = LABEL_SHRINK_MS + LABEL_HOLD_MS + LABEL_EXPAND_MS;

function updateLabelScale(particle: FieldParticle, nowMs: number): void {
  if (particle.labelAnimStart === null) {
    particle.labelScale = 1;
    return;
  }
  const elapsed = nowMs - particle.labelAnimStart;
  if (elapsed >= LABEL_ANIM_TOTAL_MS) {
    particle.labelAnimStart = null;
    particle.labelScale = 1;
  } else if (elapsed < LABEL_SHRINK_MS) {
    particle.labelScale = 1 - elapsed / LABEL_SHRINK_MS;
  } else if (elapsed < LABEL_SHRINK_MS + LABEL_HOLD_MS) {
    particle.labelScale = 0;
  } else {
    particle.labelScale = (elapsed - LABEL_SHRINK_MS - LABEL_HOLD_MS) / LABEL_EXPAND_MS;
  }
}

const toneOf = (date: Date, isToday: boolean): ColumnTone => (isToday ? 'today' : date.getDay() === 0 ? 'sunday' : date.getDay() === 6 ? 'saturday' : 'weekday');

/** The column window: an OOPS column when something is overdue, today, then 5 days that slide with `futureOffset`. */
export function buildColumns(futureOffset: number, hasOverdue: boolean): FieldColumn[] {
  const columns: FieldColumn[] = [];
  if (hasOverdue) columns.push({ key: 'overdue', label: 'OOPS', dateLabel: '', tone: 'overdue', isOverdue: true, isToday: false });
  for (let index = 0; index < DAY_COLUMNS; index++) {
    const key = offsetDateKey(index === 0 ? 0 : index + futureOffset);
    const date = new Date(`${key}T12:00:00`);
    columns.push({
      key,
      label: index === 0 ? 'TODAY' : date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      dateLabel: `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`,
      tone: toneOf(date, index === 0),
      isOverdue: false,
      isToday: index === 0,
    });
  }
  return columns;
}

/** Which column a node belongs to, or null when it falls outside the visible window. */
export function bucketColumn(node: PlannerNode, columns: readonly FieldColumn[]): number | null {
  if (isOverdue(node) || isMissed(node)) {
    const index = columns.findIndex((column) => column.isOverdue);
    return index === -1 ? null : index;
  }
  const day = plannedDateOf(node) ?? node.dueAt?.slice(0, 10) ?? null;
  if (day === null) return null;
  const index = columns.findIndex((column) => !column.isOverdue && column.key === day);
  return index === -1 ? null : index;
}

// Vertical space is split into three rows: important tasks (short), normal tasks, and events —
// events ignore importance entirely and always live in their own row.
const IMPORTANT_FRAC = 0.2;
const NORMAL_FRAC = 0.55;
// events get the remaining 0.25

export interface RowBoundaries {
  topBound: number;
  bottomBound: number;
  /** Divider between the important and normal rows. */
  importantBoundary: number;
  /** Divider between the normal and events rows. */
  normalBoundary: number;
}

export function rowBoundaries(height: number): RowBoundaries {
  const bottomBound = height - BOTTOM_MARGIN;
  const usable = bottomBound - TOP_BOUND;
  const importantBoundary = TOP_BOUND + usable * IMPORTANT_FRAC;
  return { topBound: TOP_BOUND, bottomBound, importantBoundary, normalBoundary: importantBoundary + usable * NORMAL_FRAC };
}

/** Y target for the important (top) / normal (middle) split; importance is 0 or 1, not a scale. */
export function importanceY(importance: 0 | 1, height: number, jitter: number): number {
  const { topBound, importantBoundary, normalBoundary } = rowBoundaries(height);
  const center = importance ? topBound + (importantBoundary - topBound) / 2 : importantBoundary + (normalBoundary - importantBoundary) / 2;
  return center + jitter;
}

export function eventRowY(height: number, jitter: number): number {
  const { normalBoundary, bottomBound } = rowBoundaries(height);
  return normalBoundary + (bottomBound - normalBoundary) / 2 + jitter;
}

export const homeYFor = (node: PlannerNode, height: number, jitter: number): number =>
  node.nodeType === 'event' ? eventRowY(height, jitter) : importanceY(node.importanceLevel, height, jitter);

/** y → important / normal band for click-to-place; null means the events row, which tasks can't be placed in. */
export function bandAt(y: number, height: number): 0 | 1 | null {
  const { importantBoundary, normalBoundary } = rowBoundaries(height);
  return y < importantBoundary ? 1 : y < normalBoundary ? 0 : null;
}

/** y → grid row for hover highlighting (1 important, 0 normal, 2 events); always one of the three. */
export function rowAt(y: number, height: number): 0 | 1 | 2 {
  const { importantBoundary, normalBoundary } = rowBoundaries(height);
  return y < importantBoundary ? 1 : y < normalBoundary ? 0 : 2;
}

export const columnAt = (x: number, width: number, columnCount: number): number =>
  Math.min(columnCount - 1, Math.max(0, Math.floor(x / (width / columnCount))));

export function seedParticle(node: PlannerNode, column: number, columnCount: number, width: number, height: number): FieldParticle {
  const columnWidth = width / columnCount;
  const yJitter = (Math.random() - 0.5) * 16;
  return {
    node,
    column,
    x: columnWidth * (column + 0.5) + (Math.random() - 0.5) * columnWidth * 0.5,
    y: homeYFor(node, height, yJitter),
    vx: 0, vy: 0, fx: 0, fy: 0,
    opacity: 1, scale: 1,
    phase: Math.random() * Math.PI * 2,
    jitterFreq: 0.45 + Math.random() * 0.35,
    yJitter,
    labelScale: 1,
    labelAnimStart: null,
  };
}

/**
 * Brings the particle map in line with the nodes: new ones are seeded in their column, existing ones
 * keep their motion but get the fresh node, and ones that left the window are dropped. Only open
 * nodes are shown. Mutates `particles` — like tick(), a deliberate exception to the project's
 * immutability rule: a per-frame render loop over dozens of particles shouldn't allocate.
 */
export function syncParticles(particles: Map<string, FieldParticle>, nodes: readonly PlannerNode[], columns: readonly FieldColumn[], width: number, height: number): void {
  const seen = new Set<string>();
  for (const node of nodes) {
    if (node.isCompleted) continue;
    const column = bucketColumn(node, columns);
    if (column === null) continue;
    seen.add(node.id);
    const existing = particles.get(node.id);
    if (existing) {
      existing.node = node;
      existing.column = column;
    } else {
      particles.set(node.id, seedParticle(node, column, columns.length, width, height));
    }
  }
  for (const id of Array.from(particles.keys())) {
    if (!seen.has(id)) particles.delete(id);
  }
}

/** Starts the shrink-into-dot / travel / expand-back sequence for a node's label. */
export function launchParticle(particle: FieldParticle, nowMs: number): void {
  particle.labelAnimStart = nowMs;
}

export const arcIdOf = (node: PlannerNode): string => node.arcId ?? NO_ARC_ID;

/** The vertical range a node's dot may sit in: inside its own row, leaving room for the label under it. */
function dotRangeY(node: PlannerNode, height: number): { min: number; max: number } {
  const { topBound, bottomBound, importantBoundary, normalBoundary } = rowBoundaries(height);
  const [rowTop, rowBottom] = node.nodeType === 'event' ? [normalBoundary, bottomBound] : node.importanceLevel === 1 ? [topBound, importantBoundary] : [importantBoundary, normalBoundary];
  const min = rowTop + RADIUS + EDGE_PX;
  return { min, max: Math.max(min, rowBottom - FOOTPRINT_BELOW - 1) };
}

/**
 * Advances every particle one frame: fade hidden arcs, push overlapping footprints (dot + label) apart
 * along whichever axis separates them fastest, spring each toward its home cell, and keep it inside
 * its row and the canvas. Mutates the particles in place (see syncParticles).
 */
export function tick(
  particles: readonly FieldParticle[],
  columnCount: number,
  hiddenArcIds: readonly string[],
  selectedId: string | null,
  width: number,
  height: number,
  isReducedMotion: boolean,
  nowMs: number,
): void {
  const jitterK = isReducedMotion ? 0 : 0.12;
  const seconds = nowMs / 1000;

  for (const particle of particles) {
    const isVisible = !hiddenArcIds.includes(arcIdOf(particle.node));
    particle.opacity += ((isVisible ? 1 : 0.12) - particle.opacity) * 0.08;
    particle.scale += ((isVisible ? 1 : 0.55) - particle.scale) * 0.08;
    updateLabelScale(particle, nowMs);
    particle.fx = 0;
    particle.fy = 0;
  }

  const halfWidths = particles.map((particle) => footprintHalfWidth(particle.node));
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i];
      const b = particles[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const overlapX = halfWidths[i] + halfWidths[j] + FOOTPRINT_PAD - Math.abs(dx);
      const overlapY = 2 * FOOTPRINT_HALF_HEIGHT + FOOTPRINT_PAD - Math.abs(dy);
      if (overlapX <= 0 || overlapY <= 0) continue;
      if (overlapY <= overlapX) {
        const push = overlapY * REPEL_K * (dy === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dy));
        a.fy -= push;
        b.fy += push;
      } else {
        const push = overlapX * REPEL_K * (dx === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dx));
        a.fx -= push;
        b.fx += push;
      }
    }
  }

  const columnWidth = width / columnCount;
  particles.forEach((particle, index) => {
    if (particle.node.id === selectedId) return;
    const homeX = columnWidth * (particle.column + 0.5);
    const homeY = homeYFor(particle.node, height, particle.yJitter);
    const ax = (homeX - particle.x) * SPRING_K + particle.fx + Math.sin(seconds * particle.jitterFreq + particle.phase) * jitterK;
    const ay = (homeY - particle.y) * SPRING_K + particle.fy + Math.cos(seconds * particle.jitterFreq * 0.8 + particle.phase) * jitterK;
    particle.vx = (particle.vx + ax) * DAMPING;
    particle.vy = (particle.vy + ay) * DAMPING;
    particle.x += particle.vx;
    particle.y += particle.vy;
    const { min: minY, max: maxY } = dotRangeY(particle.node, height);
    if (particle.y < minY) { particle.y = minY; particle.vy *= EDGE_BOUNCE; }
    if (particle.y > maxY) { particle.y = maxY; particle.vy *= EDGE_BOUNCE; }
    const minX = halfWidths[index] + EDGE_PX;
    if (particle.x < minX) { particle.x = minX; particle.vx *= EDGE_BOUNCE; }
    if (particle.x > width - minX) { particle.x = width - minX; particle.vx *= EDGE_BOUNCE; }
  });
}
