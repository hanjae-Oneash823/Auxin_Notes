import type { Arc } from '../../db/queries/planner/types.ts';
import { MISSED_COLOR, NEUTRAL_COLOR, OVERDUE_COLOR, isMissed, isOverdue, nodeColor } from '../nodeDerived.ts';
import { withAlpha, type FieldPalette } from './fieldPalette.ts';
import { DOT_DIAMETER, rowBoundaries, type ColumnTone, type FieldColumn, type FieldParticle } from './fieldPhysics.ts';

const RADIUS = DOT_DIAMETER / 2;
/** The ring around a node picked up to be moved. */
const SELECTION_COLOR = '#f59e0b';
const IMPORTANT_COLOR = '#f5d90a';
const EVENTS_COLOR = '#b366f5';
const SATURDAY_COLOR = '#64c8ff';
const SUNDAY_COLOR = '#ff6b35';
const OVERDUE_LABEL_COLOR = '#f87171';

/** Grid line strength as a share of the text color, so lines are faint in both themes. */
const COLUMN_LINE_ALPHA = 0.1;
const ROW_LINE_ALPHA = 0.14;

const LABEL_MAX_WIDTH = 120;
const LABEL_PAD_X = 8;
const LABEL_HEIGHT = 20;
const LABEL_GAP = 15;

const toneColor = (tone: ColumnTone, palette: FieldPalette): string =>
  tone === 'today' ? palette.text : tone === 'saturday' ? SATURDAY_COLOR : tone === 'sunday' ? SUNDAY_COLOR : tone === 'overdue' ? OVERDUE_LABEL_COLOR : palette.muted;

/**
 * The title bubble under a dot. `restY` is its resting position, `dotY` the dot's center; `scale`
 * blends between them (1 = at rest, 0 = collapsed into the dot) and shrinks and fades it through a
 * canvas transform. The text is measured and truncated once at full size, so it doesn't re-wrap mid-animation.
 */
function drawLabelBubble(ctx: CanvasRenderingContext2D, text: string, centerX: number, restY: number, dotY: number, scale: number, palette: FieldPalette): void {
  if (scale < 0.04) return;
  ctx.font = `400 12px ${palette.fontFamily}`;
  let label = text;
  if (ctx.measureText(label).width > LABEL_MAX_WIDTH) {
    while (label.length > 1 && ctx.measureText(`${label}…`).width > LABEL_MAX_WIDTH) label = label.slice(0, -1);
    label = `${label}…`;
  }
  const width = ctx.measureText(label).width + LABEL_PAD_X * 2;
  const radius = LABEL_HEIGHT / 2;

  ctx.save();
  ctx.translate(centerX, dotY + (restY - dotY) * scale);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= scale;
  ctx.beginPath();
  ctx.roundRect(-width / 2, -LABEL_HEIGHT / 2, width, LABEL_HEIGHT, radius);
  ctx.fillStyle = withAlpha(palette.background, 0.72);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.text;
  ctx.fillText(label, 0, 0.5);
  ctx.restore();
}

export interface DrawOptions {
  columns: readonly FieldColumn[];
  arcs: readonly Arc[];
  palette: FieldPalette;
  hoverNodeId: string | null;
  selectedNodeId: string | null;
  /** Column and band (1 important, 0 normal) under the cursor while a node is picked up; -1 when none. */
  moveZone: number;
  moveBand: number;
  /** Column and row (1 important, 0 normal, 2 events) under the cursor for the plain cell highlight; -1 when none. */
  hoverCellZone: number;
  hoverCellRow: number;
  cursor: { x: number; y: number; isActive: boolean };
  isReducedMotion: boolean;
}

export function drawField(ctx: CanvasRenderingContext2D, width: number, height: number, particles: readonly FieldParticle[], options: DrawOptions): void {
  ctx.clearRect(0, 0, width, height);
  if (!width || !height) return;
  const { columns, palette } = options;
  const selected = options.selectedNodeId ? particles.find((particle) => particle.node.id === options.selectedNodeId) ?? null : null;
  const columnWidth = width / columns.length;
  const { topBound, bottomBound, importantBoundary, normalBoundary } = rowBoundaries(height);
  const todayIndex = columns.findIndex((column) => column.isToday);
  if (todayIndex >= 0) {
    ctx.fillStyle = withAlpha(palette.text, 0.035);
    ctx.fillRect(columnWidth * todayIndex, topBound, columnWidth, height - topBound);
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(palette.text, COLUMN_LINE_ALPHA);
  for (let index = 1; index < columns.length; index++) {
    ctx.beginPath();
    ctx.moveTo(columnWidth * index, topBound);
    ctx.lineTo(columnWidth * index, height);
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  columns.forEach((column, index) => {
    const centerX = columnWidth * (index + 0.5);
    ctx.fillStyle = toneColor(column.tone, palette);
    ctx.font = `500 13px ${palette.fontFamily}`;
    ctx.fillText(column.label, centerX, 22);
    if (column.dateLabel) {
      ctx.font = `400 20px ${palette.fontFamily}`;
      ctx.fillText(column.dateLabel, centerX, 48);
    }
  });

  ctx.strokeStyle = withAlpha(palette.text, ROW_LINE_ALPHA);
  for (const y of [topBound, importantBoundary, normalBoundary]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.textAlign = 'left';
  ctx.font = `500 11px ${palette.fontFamily}`;
  ctx.fillStyle = IMPORTANT_COLOR;
  ctx.fillText('IMPORTANT', 8, topBound + 16);
  ctx.fillStyle = palette.faint;
  ctx.fillText('NORMAL', 8, importantBoundary + 16);
  ctx.fillStyle = EVENTS_COLOR;
  ctx.fillText('EVENTS', 8, normalBoundary + 16);
  ctx.textAlign = 'center';

  if (options.hoverCellZone >= 0 && options.hoverCellZone < columns.length && options.hoverCellRow >= 0) {
    const row = options.hoverCellRow;
    ctx.fillStyle = withAlpha(palette.text, 0.045);
    ctx.fillRect(
      columnWidth * options.hoverCellZone,
      row === 1 ? topBound : row === 0 ? importantBoundary : normalBoundary,
      columnWidth,
      row === 1 ? importantBoundary - topBound : row === 0 ? normalBoundary - importantBoundary : bottomBound - normalBoundary,
    );
  }

  if (selected && options.moveZone >= 0 && options.moveZone < columns.length && !columns[options.moveZone].isOverdue && options.moveBand >= 0) {
    ctx.fillStyle = withAlpha(SELECTION_COLOR, 0.09);
    ctx.fillRect(
      columnWidth * options.moveZone,
      options.moveBand === 1 ? topBound : importantBoundary,
      columnWidth,
      options.moveBand === 1 ? importantBoundary - topBound : normalBoundary - importantBoundary,
    );
  }

  if (selected && options.cursor.isActive) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = withAlpha(SELECTION_COLOR, 0.55);
    ctx.beginPath();
    ctx.moveTo(selected.x, selected.y);
    ctx.lineTo(options.cursor.x, options.cursor.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const pulse = (Math.sin(performance.now() / 420) + 1) / 2;
  for (const particle of particles) {
    const { node } = particle;
    const radius = RADIUS * particle.scale;
    ctx.globalAlpha = particle.opacity;
    if (node.nodeType === 'event') {
      // Events are hollow rings in their arc's color.
      ctx.fillStyle = palette.background;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = options.arcs.find((arc) => arc.id === node.arcId)?.colorHex ?? NEUTRAL_COLOR;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius - 1.5, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = nodeColor(node, options.arcs);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    const warning = isOverdue(node) ? OVERDUE_COLOR : isMissed(node) ? MISSED_COLOR : null;
    if (warning && !options.isReducedMotion) {
      ctx.strokeStyle = withAlpha(warning, 0.3 + pulse * 0.35);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius + 2 + pulse * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    if (options.hoverNodeId === node.id) {
      ctx.strokeStyle = withAlpha(palette.text, 0.8);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (options.selectedNodeId === node.id) {
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawLabelBubble(ctx, node.title, particle.x, particle.y + radius + LABEL_GAP, particle.y, particle.labelScale, palette);
    ctx.globalAlpha = 1;
  }
}
