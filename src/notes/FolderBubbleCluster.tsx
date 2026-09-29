import { Fragment, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CaretRight } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '../layout/ContextMenu';
import { ConfirmDialog } from '../layout/ConfirmDialog';
import { BubbleFolderNameInput } from './BubbleFolderNameInput';
import { BubbleControls, CONTROL_RADIUS_PX, CONTROLS_SPAN, backButtonCenter } from './BubbleControls';
import type { FolderNode } from '../vault/folderTree';
import { placeLabels, type LabelPlacement } from './bubbleLabelPlacement';

/** The Home dashboard's chart box; the full navigator passes its own size. */
const DEFAULT_CHART_WIDTH = 600;
const DEFAULT_CHART_HEIGHT = 220;
const FIT_MARGIN = 0.97;
const MAX_BUBBLE_RADIUS = 90;
const MIN_BUBBLE_RADIUS = 18;
/** Notes get a small, uniform radius rather than the folder palette's
 *  count-proportional sizing — they're leaves, not something with its own
 *  internal breakdown worth sizing by, so "small and clearly not a folder"
 *  matters more here than area-proportional accuracy. */
const NOTE_BUBBLE_RADIUS = 13;
/** Full view: notes reserve more room, so there's free space around each small
 *  dot for its label to be placed in (see bubbleLabelPlacement.ts). */
const NOTE_BUBBLE_RADIUS_FULL = 30;
const NOTE_DOT_RATIO_FULL = 0.4;
/** The bundle's packing slot vs. the note-dot slot, so it always fits. */
const CONTROLS_SLOT_RATIO = 1.2;
const NOTE_LABEL_FONT_PX = 11;
/** Space between a dot and its label, as a fraction of the label's font size. */
const LABEL_GAP_RATIO = 0.35;
/** Full view: plain notes are light grey dots, canvases blue, PDFs red; the
 *  title box laid over each dot is a brighter shade of it (dark text reads
 *  on all three). */
const NOTE_KIND_STYLE: Record<NoteKind, { fill: string; boxFill: string; text: string }> = {
  note: { fill: '#d0d0d0', boxFill: '#ffffff', text: '#111111' },
  canvas: { fill: '#3b7be0', boxFill: '#7db3ff', text: '#0b1220' },
  pdf: { fill: '#d13a40', boxFill: '#ff7d82', text: '#1a0808' },
};
const BUBBLE_PADDING = 4;
const MAX_SPIRAL_STEPS = 4000;
const SPIRAL_ANGLE_STEP = 0.34;
const SPIRAL_RADIUS_STEP = 1.4;
/** Label size bounds in on-screen px: the count line's range, and the folder
 *  name line as a fraction of it. */
const COMPACT_LABELS = { minPx: 10, maxPx: 22, nameRatio: 0.48 };
const FULL_LABELS = { minPx: 12, maxPx: 26, nameRatio: 0.55 };
const HOVER_SCALE = 1.08;
/** Pointer travel (px) before a press counts as a drag rather than a click. */
const DRAG_CLICK_THRESHOLD_PX = 4;
/** How far from the back button's center (in button radii) a dragged bubble still counts as over it. */
const DROP_REACH_RATIO = 1.5;
/** Overshoots slightly on the way home, like a released spring. */
const DRAG_RETURN_TRANSITION = 'transform 550ms cubic-bezier(0.34, 1.56, 0.64, 1)';
const HOVER_GLOW = 'drop-shadow(0 0 8px var(--accent-tag))';
const NOTE_HOVER_GLOW = 'drop-shadow(0 0 8px var(--bubble-note-teal))';
const TOOLTIP_EDGE_CLAMP_PERCENT = 8;
const BUBBLE_STROKE_WIDTH = 2;
/** Per-bubble fill colors cycled by index (like DRIFT_VARIANTS) so adjacent
 *  bubbles read as clearly different greens rather than one flat color
 *  repeated everywhere. A CSS `filter: hue-rotate()` on --accent-tag was
 *  tried first but rendered identically across bubbles in this app's
 *  WebView even after a clean restart — animating `transform` (the drift
 *  keyframes) and a static `filter` on the same SVG element is an
 *  unreliable pairing — so these are real, distinct hex fills instead,
 *  defined per-theme as --bubble-green-1..5 in tokens.css. */
const BUBBLE_FILL_VARIANTS = [
  'var(--bubble-green-1)',
  'var(--bubble-green-2)',
  'var(--bubble-green-3)',
  'var(--bubble-green-4)',
  'var(--bubble-green-5)',
];
/** Fallback label for the back button in the rare case its folder vanished
 *  from under it (deleted/moved while browsing) and `node` fell back to the
 *  vault root — same "Vault" convention formatFolder (noteStats.ts) uses
 *  for a root-level note's folder display. */
const VAULT_ROOT_LABEL = 'Vault';
/** Cycled by index so adjacent bubbles rarely share a drift path; each
 *  instance also gets a negative animation-delay (see DRIFT_DELAY_STEP) so
 *  they don't all start in sync. */
const DRIFT_VARIANTS = ['bubble-drift-a', 'bubble-drift-b', 'bubble-drift-c'];
const DRIFT_DELAY_STEP_SECONDS = 0.9;

interface FolderBubbleClusterProps {
  root: FolderNode;
  /** Opens a note (vault-relative path) as a tab — wired to every note
   *  bubble's click. */
  /** `source` is the clicked bubble (an SVG `<g>`), for the fly-to-tab animation. */
  onSelectNote: (relativePath: string, source: SVGGElement) => void;
  /** Chart size in px (the SVG viewBox, so 1 unit = 1px when it fills its
   *  box). Defaults to the compact Home-dashboard size. */
  width?: number;
  height?: number;
  /** Where to render the breadcrumb bar. Omitted: the chart's own top-left.
   *  An element: portaled there. `null`: that element isn't mounted yet. */
  breadcrumbHost?: HTMLElement | null;
  /** Rendered size in px, when it should differ from the packing size
   *  (`width`/`height`) — the layout is then just scaled, never re-packed.
   *  Omitted: fills its container's width at `height`. */
  displayWidth?: number;
  displayHeight?: number;
  /** Full view only: the bundle of buttons (back, new, open in Finder) at the
   *  chart's center. `folderPath` is the folder being viewed (`''` = root). */
  folderActions?: FolderActions;
}

export interface FolderActions {
  onNewNote: (folderPath: string) => void;
  onNewCanvas: (folderPath: string) => void;
  onImportPdf: (folderPath: string) => void;
  /** Creates the folder and returns its relative path, so the cluster can
   *  offer its name for editing once its bubble appears. */
  onNewSubfolder: (parentPath: string) => string;
  onRenameFolder: (folderPath: string, newName: string) => void;
  /** Drop targets: a folder's path, or the parent folder's for the back button. */
  onMoveNote: (notePath: string, targetFolderPath: string) => void;
  onMoveFolder: (folderPath: string, targetParentPath: string) => void;
  onRevealInFinder: (folderPath: string) => void;
}

type BubbleItem =
  | { kind: 'folder'; path: string; name: string; count: number }
  | { kind: 'note'; path: string; title: string; noteKind: NoteKind; modified: string }
  /** Full view only: a placeholder that reserves room for the control bundle. */
  | { kind: 'controls'; path: string };

type NoteKind = 'note' | 'canvas' | 'pdf';

interface PositionedBubble {
  item: BubbleItem;
  r: number;
  x: number;
  y: number;
}

/** Drill-down position: `path` is the folder currently shown (`''` for the
 *  vault root), `history` the stack of paths to pop back through. A plain
 *  `currentPath` string couldn't support the back button on its own — it
 *  has nowhere to remember where "back" goes once you're more than one
 *  level deep. */
interface PendingFolderMove {
  path: string;
  name: string;
  targetPath: string;
  targetName: string;
}

type DropTarget = { kind: 'back' } | { kind: 'folder'; path: string };

interface BubbleNav {
  path: string;
  history: string[];
}

/** A bubble being dragged (`isActive`) or springing back to rest (offset 0). */
interface DragState {
  index: number;
  dx: number;
  dy: number;
  isActive: boolean;
}

const ROOT_NAV: BubbleNav = { path: '', history: [] };

function findNodeByPath(node: FolderNode, path: string): FolderNode | null {
  if (node.path === path) return node;
  for (const folder of node.folders) {
    const found = findNodeByPath(folder, path);
    if (found) return found;
  }
  return null;
}

/**
 * Packs circles outward from the center along an expanding spiral, placing
 * each one at the first angle/radius where it doesn't overlap anything
 * already placed. Not an optimal packing (that's what d3-pack is for — and
 * this app has no charting dependency, only d3-force for the unrelated
 * graph view), but good enough for the handful of items a folder typically
 * holds directly.
 */
function packCircles(radii: number[], chartWidth: number, chartHeight: number): { x: number; y: number }[] {
  // The search spirals outward in an ellipse matching the chart's shape
  // (sqrt of its aspect ratio, so area grows at the same rate as a circular
  // spiral would) rather than a circle — a circular pack squeezed into a
  // wide-short box wastes most of its width and only gets sized by the box's
  // shorter dimension, making every bubble tiny. Only the search envelope is
  // stretched; placed circles stay true circles.
  const spiralAspectX = Math.sqrt(chartWidth / chartHeight);
  const spiralAspectY = 1 / spiralAspectX;
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < radii.length; i++) {
    const r = radii[i];
    if (i === 0) {
      positions.push({ x: 0, y: 0 });
      continue;
    }
    let angle = 0;
    let spiralRadius = 0;
    for (let step = 0; step < MAX_SPIRAL_STEPS; step++) {
      const candidate = {
        x: spiralRadius * spiralAspectX * Math.cos(angle),
        y: spiralRadius * spiralAspectY * Math.sin(angle),
      };
      const overlaps = positions.some(
        (placed, j) => Math.hypot(placed.x - candidate.x, placed.y - candidate.y) < radii[j] + r + BUBBLE_PADDING,
      );
      if (!overlaps) {
        positions.push(candidate);
        break;
      }
      angle += SPIRAL_ANGLE_STEP;
      spiralRadius += SPIRAL_RADIUS_STEP;
    }
  }
  return positions;
}

/** Rough "does this text fit on one line inside a circle of radius r"
 *  check — no DOM measurement available at layout time, so this estimates
 *  glyph width from character count. Used only to decide inline-label vs
 *  tooltip-only, never to render (so a wrong guess costs a label, not a
 *  clipped one). */
function estimateLabelFits(text: string, fontSize: number, radius: number): boolean {
  const estimatedWidth = text.length * fontSize * 0.58;
  return estimatedWidth <= radius * 2 * 0.82;
}

/** Shortens a folder name to roughly the width estimateLabelFits allows,
 *  appending an ellipsis — the same glyph-width estimate as above, inverted
 *  to a character budget instead of a fit check, minus one slot for the
 *  ellipsis itself. Used only when the name doesn't fit whole, so the
 *  bubble's second line never gets dropped entirely just for being long. */
function truncateLabelToFit(text: string, fontSize: number, radius: number): string {
  const maxChars = Math.max(1, Math.floor((radius * 2 * 0.82) / (fontSize * 0.58)) - 1);
  return `${text.slice(0, maxChars).trimEnd()}…`;
}

/**
 * The Home dashboard's folder-breakdown visual — a circle-packed cluster of
 * the current folder's direct children: subfolders (area proportional to
 * their own note count, in the green palette) and notes/canvases (small,
 * uniform teal bubbles). Clicking a folder bubble drills into it — its own
 * subfolders and notes replace the current view — and the back button
 * (top-left, only shown below the vault root) retraces that path one level
 * at a time. Clicking a note bubble opens it as a tab instead of
 * navigating.
 *
 * Each bubble's inline label is drawn in the page background color so it
 * reads as ink cut into the fill regardless of theme (see the dataviz
 * skill's "label inside a colored fill" exception). A bubble too small to
 * hold both lines drops the inline label and relies on the hover tooltip
 * instead, same as every other bubble — the tooltip is shown for all of
 * them, not just the small ones, for one consistent hover behavior. Note
 * bubbles are always too small for an inline label, so they're
 * tooltip-only.
 */
export function FolderBubbleCluster({
  root,
  onSelectNote,
  width: chartWidth = DEFAULT_CHART_WIDTH,
  height: chartHeight = DEFAULT_CHART_HEIGHT,
  breadcrumbHost,
  displayWidth,
  displayHeight,
  folderActions,
}: FolderBubbleClusterProps) {
  // A display size marks the full navigator, which labels its note dots.
  const isFull = displayWidth !== undefined;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [nav, setNav] = useState<BubbleNav>(ROOT_NAV);
  // Which way the last navigation went — picks the zoom-in vs zoom-out entry
  // animation for the freshly mounted bubble set (see bubbles-nav-in/-out,
  // global.css). Not reset on the initial render since nothing has animated
  // in yet to animate away from.
  const [navDirection, setNavDirection] = useState<'in' | 'out'>('in');

  // Aesthetic-only dragging: a bubble follows the pointer, then springs back.
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; pxPerUnit: number } | null>(null);
  const didDragRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  function startDrag(event: React.PointerEvent<SVGGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // The viewBox is fitted with `meet`, so one uniform px-per-unit scale.
    const pxPerUnit = Math.min(rect.width / chartWidth, rect.height / chartHeight);
    dragStartRef.current = { x: event.clientX, y: event.clientY, pxPerUnit };
    didDragRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<SVGGElement>, index: number) {
    const start = dragStartRef.current;
    if (!start) return;
    const dxPx = event.clientX - start.x;
    const dyPx = event.clientY - start.y;
    // Small wobbles stay clicks.
    if (!didDragRef.current && Math.hypot(dxPx, dyPx) < DRAG_CLICK_THRESHOLD_PX) return;
    didDragRef.current = true;
    setDrag({ index, dx: dxPx / start.pxPerUnit, dy: dyPx / start.pxPerUnit, isActive: true });
  }

  /** What a dragged bubble is over: the back button (its parent folder) or
   *  another folder's bubble. Geometry, not DOM hit-testing — the dragged
   *  bubble holds pointer capture, so nothing else receives pointer events. */
  function findDropTarget(index: number, offset: { dx: number; dy: number }): DropTarget | null {
    const dragged = bubbles[index];
    if (!dragged) return null;
    const x = dragged.x + offset.dx;
    const y = dragged.y + offset.dy;
    if (controlBubble && node.path !== '') {
      const back = backButtonCenter(controlBubble.x, controlBubble.y, controlRadius);
      if (Math.hypot(x - back.x, y - back.y) < controlRadius * DROP_REACH_RATIO) return { kind: 'back' };
    }
    for (let other = 0; other < bubbles.length; other++) {
      const target = bubbles[other];
      if (other === index || target.item.kind !== 'folder') continue;
      if (Math.hypot(x - target.x, y - target.y) < target.r) return { kind: 'folder', path: target.item.path };
    }
    return null;
  }

  function dropOnTarget(index: number, target: DropTarget | null) {
    const item = bubbles[index]?.item;
    if (!target || !item || !folderActions) return;
    const targetPath = target.kind === 'back' ? node.path.split('/').slice(0, -1).join('/') : target.path;
    if (item.kind === 'folder') {
      // Moving a folder relocates everything in it, so it asks first.
      const targetName = targetPath === '' ? VAULT_ROOT_LABEL : (targetPath.split('/').pop() ?? targetPath);
      setPendingFolderMove({ path: item.path, name: item.name, targetPath, targetName });
    } else if (item.kind === 'note') folderActions.onMoveNote(item.path, targetPath);
  }

  function endDrag(index: number) {
    dragStartRef.current = null;
    if (folderActions && drag?.index === index && drag.isActive) dropOnTarget(index, findDropTarget(index, drag));
    setDrag((current) => (current?.index === index ? { index, dx: 0, dy: 0, isActive: false } : current));
  }

  function enterFolder(path: string) {
    setRenamingPath(null);
    setDrag(null);
    setHoverIndex(null);
    setNavDirection('in');
    setNav((current) => ({ path, history: [...current.history, current.path] }));
  }

  /** Jumps to an ancestor folder (a breadcrumb); its history is just the
   *  folders above it, since bubbles only ever drill into direct children. */
  function goToPath(path: string) {
    setRenamingPath(null);
    setDrag(null);
    setHoverIndex(null);
    setNavDirection('out');
    setNav({ path, history: crumbsFor(path).slice(0, -1).map((crumb) => crumb.path) });
  }

  // Falls back to the vault root if the folder being viewed vanished from
  // under it (deleted/moved elsewhere while the dashboard was open) rather
  // than rendering nothing.
  const node = findNodeByPath(root, nav.path) ?? root;

  const bubbles = useMemo<PositionedBubble[]>(() => {
    const folderItems: BubbleItem[] = node.folders.map((folder) => ({
      kind: 'folder',
      path: folder.path,
      name: folder.name,
      count: folder.noteCount,
    }));
    const noteRows = node.hub ? [node.hub, ...node.notes] : node.notes;
    const noteItems: BubbleItem[] = noteRows.map((note) => ({
      kind: 'note',
      path: note.path,
      title: note.title,
      noteKind: note.isCanvas ? 'canvas' : note.isPdf ? 'pdf' : 'note',
      modified: note.modified,
    }));
    const controlItems: BubbleItem[] = isFull && folderActions ? [{ kind: 'controls', path: '..' }] : [];
    const items: BubbleItem[] = [...controlItems, ...folderItems, ...noteItems];
    if (items.length === 0) return [];

    const maxFolderCount = folderItems.reduce(
      (max, item) => (item.kind === 'folder' ? Math.max(max, item.count) : max),
      1,
    );
    const radii = items.map((item) =>
      item.kind === 'folder'
        ? Math.max(MIN_BUBBLE_RADIUS, Math.sqrt(item.count / maxFolderCount) * MAX_BUBBLE_RADIUS)
        : item.kind === 'controls'
          ? NOTE_BUBBLE_RADIUS_FULL * CONTROLS_SLOT_RATIO
          : isFull
            ? NOTE_BUBBLE_RADIUS_FULL
            : NOTE_BUBBLE_RADIUS,
    );

    // Bigger bubbles pack tighter when placed first, so packing runs over a
    // radius-descending index order; positions are zipped back onto the
    // original items afterward rather than reordering `items` itself, which
    // would make hover/click handlers below harder to reason about.
    // The control bundle is always packed first — the packer puts its first circle at
    // the origin — so it sits at the chart's center at every level.
    const hasControls = controlItems.length > 0;
    const order = items
      .map((_, index) => index)
      .sort((a, b) => Number(items[b].kind === 'controls') - Number(items[a].kind === 'controls') || radii[b] - radii[a]);
    const orderedRadii = order.map((index) => radii[index]);
    const orderedPositions = packCircles(orderedRadii, chartWidth, chartHeight);

    const minX = Math.min(...orderedPositions.map((p, i) => p.x - orderedRadii[i]));
    const maxX = Math.max(...orderedPositions.map((p, i) => p.x + orderedRadii[i]));
    const minY = Math.min(...orderedPositions.map((p, i) => p.y - orderedRadii[i]));
    const maxY = Math.max(...orderedPositions.map((p, i) => p.y + orderedRadii[i]));
    // With the control bundle, fit around the origin (where it sits) rather than around
    // the layout's bounding box, so the bundle stays centered.
    const centerX = hasControls ? 0 : (minX + maxX) / 2;
    const centerY = hasControls ? 0 : (minY + maxY) / 2;
    const halfWidth = Math.max(maxX - centerX, centerX - minX);
    const halfHeight = Math.max(maxY - centerY, centerY - minY);
    const scale = Math.min(chartWidth / (2 * halfWidth), chartHeight / (2 * halfHeight)) * FIT_MARGIN;
    const offsetX = chartWidth / 2 - centerX * scale;
    const offsetY = chartHeight / 2 - centerY * scale;

    return order.map((originalIndex, i) => ({
      item: items[originalIndex],
      r: orderedRadii[i] * scale,
      x: orderedPositions[i].x * scale + offsetX,
      y: orderedPositions[i].y * scale + offsetY,
    }));
  }, [node, chartWidth, chartHeight, isFull]);

  // Note label size in chart units. Frozen at the first display scale, so
  // resizing the window zooms the labels along with everything else instead of
  // re-running placement each frame (which made labels hop between spots).
  const labelScaleRef = useRef<number | null>(null);
  if (labelScaleRef.current === null && displayWidth !== undefined) labelScaleRef.current = displayWidth / chartWidth;
  const labelFontSize = NOTE_LABEL_FONT_PX / (labelScaleRef.current ?? 1);
  // The control bundle keeps a constant on-screen size: unlike the bubbles and
  // labels it doesn't zoom when a panel opens or closes.
  const controlRadius = displayWidth === undefined ? 0 : (CONTROL_RADIUS_PX * chartWidth) / displayWidth;
  const controlsRadius = controlRadius * CONTROLS_SPAN;

  // Where each note's label goes (full view): most recently edited first, so
  // they get the nearest free spots; a note with no free spot has no label.
  const placements = useMemo(() => {
    if (!isFull) return new Map<number, LabelPlacement>();
    const obstacles = bubbles.map((bubble) => ({
      x: bubble.x,
      y: bubble.y,
      r:
        bubble.item.kind === 'folder'
          ? bubble.r
          : bubble.item.kind === 'controls'
            ? controlsRadius
            : bubble.r * NOTE_DOT_RATIO_FULL,
    }));
    const requests = bubbles
      .flatMap((bubble, index) =>
        bubble.item.kind === 'note' ? [{ index, modified: Date.parse(bubble.item.modified) || 0, title: bubble.item.title }] : [],
      )
      .sort((a, b) => b.modified - a.modified)
      .map(({ index, title }) => ({
        index,
        dot: obstacles[index],
        ...labelBoxSize([shortNoteLabel(title)], labelFontSize),
      }));
    return placeLabels(requests, obstacles, { width: chartWidth, height: chartHeight }, labelFontSize * LABEL_GAP_RATIO);
  }, [bubbles, isFull, labelFontSize, chartWidth, chartHeight, controlsRadius]);

  const isAtRoot = nav.history.length === 0 && nav.path === '';

  const [newMenu, setNewMenu] = useState<{ x: number; y: number } | null>(null);
  // The just-created subfolder whose bubble is showing a name field.
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  // A folder dropped onto a target, waiting for the user to confirm the move.
  const [pendingFolderMove, setPendingFolderMove] = useState<PendingFolderMove | null>(null);

  function goUp() {
    if (node.path === '') return;
    goToPath(node.path.split('/').slice(0, -1).join('/'));
  }

  const newMenuItems: ContextMenuItem[] = folderActions
    ? [
        { label: 'New note', onSelect: () => folderActions.onNewNote(node.path) },
        { label: 'Import PDF', onSelect: () => folderActions.onImportPdf(node.path) },
        { label: 'New canvas', onSelect: () => folderActions.onNewCanvas(node.path) },
        { label: 'New subfolder here', onSelect: () => setRenamingPath(folderActions.onNewSubfolder(node.path)) },
      ]
    : [];

  /** On-screen px per chart unit. */
  const displayScale = displayWidth === undefined ? 1 : displayWidth / chartWidth;

  const breadcrumbs = <Breadcrumbs crumbs={crumbsFor(node.path)} onNavigate={goToPath} />;
  // `undefined` host: sit at the chart's own top-left. A host element (the
  // full navigator's editing-area corner) gets the bar via a portal instead;
  // `null` means that host isn't mounted yet.
  const breadcrumbBar =
    breadcrumbHost === undefined ? (
      <div className="absolute left-0 top-0 z-10">{breadcrumbs}</div>
    ) : breadcrumbHost === null ? null : (
      createPortal(breadcrumbs, breadcrumbHost)
    );

  if (bubbles.length === 0) {
    return (
      <div className="relative">
        {breadcrumbBar}
        <span className="px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
          {isAtRoot ? 'no notes yet' : 'empty folder'}
        </span>
      </div>
    );
  }

  const hovered = hoverIndex !== null ? bubbles[hoverIndex] : null;
  const renamingBubble = renamingPath === null ? undefined : bubbles.find((bubble) => bubble.item.path === renamingPath);
  const controlBubble = bubbles.find((bubble) => bubble.item.kind === 'controls');
  const dropTarget = folderActions && drag?.isActive ? findDropTarget(drag.index, drag) : null;
  const tooltipLeftPercent = hovered
    ? Math.min(100 - TOOLTIP_EDGE_CLAMP_PERCENT, Math.max(TOOLTIP_EDGE_CLAMP_PERCENT, (hovered.x / chartWidth) * 100))
    : 0;
  const tooltipTopPercent = hovered ? Math.max(0, ((hovered.y - hovered.r) / chartHeight) * 100) : 0;

  return (
    <div className="relative">
      {breadcrumbBar}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        // Visible so a dragged bubble isn't cut off at the chart's own box.
        className={displayWidth === undefined ? 'w-full overflow-visible' : 'overflow-visible'}
        style={{ width: displayWidth, height: displayHeight ?? chartHeight }}
        role="img"
        aria-label={isAtRoot ? 'Note counts per folder' : `Contents of ${node.name}`}
      >
        <g key={nav.path} className={navDirection === 'in' ? 'bubbles-nav-in' : 'bubbles-nav-out'}>
          {bubbles.map((bubble, index) => {
            const isHovered = hoverIndex === index;
            const item = bubble.item;
            if (item.kind === 'controls') return null;
            const isFolder = item.kind === 'folder';
            const label = item.kind === 'folder' ? item.name : item.kind === 'note' ? item.title : 'Back';
            // Bounds are on-screen px, converted to chart units by the display
            // scale, so text stays readable when the chart is drawn smaller
            // than it was packed. The full view (which sets a display size)
            // gets larger text than the compact dashboard chart.
            const labelBounds = displayWidth === undefined ? COMPACT_LABELS : FULL_LABELS;
            const countFontSize = Math.max(
              labelBounds.minPx / displayScale,
              Math.min(labelBounds.maxPx / displayScale, bubble.r * 0.42),
            );
            const nameFontSize = countFontSize * labelBounds.nameRatio;
            // Independent, not ANDed together: a folder name too long to fit
            // shouldn't also blank out the count, which almost always has
            // room on its own — the name is a bonus second line, not a
            // condition for showing the count at all. A name that's too long
            // gets truncated with an ellipsis instead of dropped, so it's
            // still shown whenever there's room for the count. Note bubbles
            // never fit either line (see NOTE_BUBBLE_RADIUS vs MIN_BUBBLE_RADIUS)
            // and rely on the hover tooltip entirely.
            const countFits = item.kind === 'folder' && estimateLabelFits(String(item.count), countFontSize, bubble.r);
            const displayName = estimateLabelFits(label, nameFontSize, bubble.r)
              ? label
              : truncateLabelToFit(label, nameFontSize, bubble.r);

            const dragOffset = drag?.index === index ? drag : null;
            const isDropTarget = dropTarget?.kind === 'folder' && dropTarget.path === item.path;
            const driftClassName = DRIFT_VARIANTS[index % DRIFT_VARIANTS.length];
            const driftStyle = { animationDelay: `-${(index * DRIFT_DELAY_STEP_SECONDS).toFixed(2)}s` };
            const noteStyle = item.kind === 'note' && isFull ? NOTE_KIND_STYLE[item.noteKind] : null;
            const placement = placements.get(index);
            const fillColor =
              item.kind === 'folder'
                ? BUBBLE_FILL_VARIANTS[index % BUBBLE_FILL_VARIANTS.length]
                : (noteStyle?.fill ?? 'var(--bubble-note-teal)');
            const dotRadius = noteStyle ? bubble.r * NOTE_DOT_RATIO_FULL : bubble.r;
            const glow = noteStyle ? `drop-shadow(0 0 8px ${noteStyle.boxFill})` : isFolder ? HOVER_GLOW : NOTE_HOVER_GLOW;

            return (
              <g
                key={item.path}
                data-bubble
                onPointerEnter={() => setHoverIndex(index)}
                onPointerLeave={() => setHoverIndex((current) => (current === index ? null : current))}
                onFocus={() => setHoverIndex(index)}
                onBlur={() => setHoverIndex((current) => (current === index ? null : current))}
                onPointerDown={(event) => startDrag(event)}
                onPointerMove={(event) => moveDrag(event, index)}
                onPointerUp={() => endDrag(index)}
                onPointerCancel={() => endDrag(index)}
                onClick={(event) => {
                  // A drag is decoration only — it must not also drill in / open the note.
                  if (didDragRef.current) {
                    didDragRef.current = false;
                    return;
                  }
                  if (item.kind === 'folder') enterFolder(item.path);
                  else onSelectNote(item.path, event.currentTarget);
                }}
                tabIndex={0}
                role="img"
                aria-label={
                  item.kind === 'folder'
                    ? `${item.name}: ${item.count} ${item.count === 1 ? 'note' : 'notes'}`
                    : item.title
                }
                style={{
                  transformOrigin: `${bubble.x}px ${bubble.y}px`,
                  transform: `translate(${dragOffset?.dx ?? 0}px, ${dragOffset?.dy ?? 0}px) scale(${isHovered ? HOVER_SCALE : 1})`,
                  // Follows the pointer with no easing; on release it springs back home.
                  transition: dragOffset?.isActive ? 'none' : dragOffset ? DRAG_RETURN_TRANSITION : 'transform 150ms ease',
                  cursor: dragOffset?.isActive ? 'grabbing' : 'grab',
                  touchAction: 'none',
                }}
              >
                {/* The drift animation is applied to the circle and each text
                 *  element individually (not to a shared wrapping <g>) because
                 *  browsers don't reliably propagate an animated ancestor
                 *  transform down to <text> the way they do to <circle> — the
                 *  text can lag or snap between keyframes, making it appear to
                 *  drift independently. Giving every element the same
                 *  animation name/duration/delay keeps them locked together
                 *  since each one runs its own identical keyframe schedule
                 *  instead of inheriting through the SVG tree. */}
                {placement?.hasLeader && (
                  <line
                    x1={bubble.x}
                    y1={bubble.y}
                    x2={placement.x}
                    y2={placement.y}
                    stroke="currentColor"
                    strokeWidth={1}
                    className={`text-fg-faint ${driftClassName}`}
                    style={driftStyle}
                  />
                )}
                <circle
                  cx={bubble.x}
                  cy={bubble.y}
                  r={dotRadius}
                  stroke={isDropTarget ? 'var(--color-fg)' : 'black'}
                  strokeWidth={isDropTarget ? BUBBLE_STROKE_WIDTH * 3 : BUBBLE_STROKE_WIDTH}
                  className={driftClassName}
                  style={{
                    ...driftStyle,
                    fill: fillColor,
                    filter: isHovered || isDropTarget ? glow : 'none',
                    transition: 'filter 150ms ease',
                  }}
                />
                {/* After the dot: the box starts at the dot's center and is drawn on top of it. Hidden, not removed, while hovered (the expanded label replaces it) so it keeps the hit area. */}
                {noteStyle && item.kind === 'note' && placement && (
                  <LabelBox
                    x={placement.x}
                    y={placement.y}
                    lines={[shortNoteLabel(item.title)]}
                    fontSize={labelFontSize}
                    style={noteStyle}
                    className={driftClassName}
                    extraStyle={isHovered ? { ...driftStyle, opacity: 0 } : driftStyle}
                  />
                )}
                {countFits && item.kind === 'folder' && item.path !== renamingPath && (
                  <>
                    <text
                      x={bubble.x}
                      y={bubble.y - countFontSize * 0.2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className={`fill-bg ${driftClassName}`}
                      style={{ ...driftStyle, fontSize: countFontSize, fontWeight: 700 }}
                    >
                      {item.count}
                    </text>
                    <text
                      x={bubble.x}
                      y={bubble.y + countFontSize * 0.75}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className={`fill-bg ${driftClassName}`}
                      style={{ ...driftStyle, fontSize: nameFontSize, fontWeight: 600, opacity: 0.85 }}
                    >
                      {displayName}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </g>
        {folderActions && controlBubble && (
          <BubbleControls
            x={controlBubble.x}
            y={controlBubble.y}
            radius={controlRadius}
            hasBack={node.path !== ''}
            onBack={goUp}
            onNew={(anchor) => setNewMenu({ x: anchor.left, y: anchor.bottom + 4 })}
            onRevealInFinder={() => folderActions.onRevealInFinder(node.path)}
            isBackDropTarget={dropTarget?.kind === 'back'}
          />
        )}
        {isFull && hovered?.item.kind === 'note' && (
          <ExpandedNoteLabel
            x={placements.get(hoverIndex ?? -1)?.x ?? hovered.x}
            y={placements.get(hoverIndex ?? -1)?.y ?? hovered.y}
            fontSize={labelFontSize}
            text={hovered.item.title}
            style={NOTE_KIND_STYLE[hovered.item.noteKind]}
            offset={drag?.index === hoverIndex ? drag : { dx: 0, dy: 0 }}
          />
        )}
      </svg>

      {renamingBubble && folderActions && renamingBubble.item.kind === 'folder' && (
        <BubbleFolderNameInput
          key={renamingBubble.item.path}
          initialName={renamingBubble.item.name}
          leftPercent={(renamingBubble.x / chartWidth) * 100}
          topPercent={(renamingBubble.y / chartHeight) * 100}
          diameterPercent={((renamingBubble.r * 2) / chartWidth) * 100}
          onCommit={(name) => {
            const { path, name: currentName } = renamingBubble.item as Extract<BubbleItem, { kind: 'folder' }>;
            setRenamingPath(null);
            if (name && name !== currentName) folderActions.onRenameFolder(path, name);
          }}
          onCancel={() => setRenamingPath(null)}
        />
      )}

      {pendingFolderMove && folderActions && (
        <ConfirmDialog
          message={`Move folder "${pendingFolderMove.name}" into "${pendingFolderMove.targetName}"?`}
          confirmLabel="move"
          onCancel={() => setPendingFolderMove(null)}
          onConfirm={() => {
            folderActions.onMoveFolder(pendingFolderMove.path, pendingFolderMove.targetPath);
            setPendingFolderMove(null);
          }}
        />
      )}

      {newMenu && <ContextMenu x={newMenu.x} y={newMenu.y} items={newMenuItems} onClose={() => setNewMenu(null)} />}

      {/* Full-view notes show their whole title in the expanded box instead. */}
      {hovered && !(isFull && hovered.item.kind === 'note') && (
        <div
          className="pointer-events-none absolute flex flex-col gap-0.5 whitespace-nowrap rounded-row border border-border-subtle bg-bg-panel px-2.5 py-1.5"
          style={{
            left: `${tooltipLeftPercent}%`,
            top: `${tooltipTopPercent}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {hovered.item.kind === 'folder' ? (
            <>
              <span className="text-fg-prominent" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                {hovered.item.count} {hovered.item.count === 1 ? 'note' : 'notes'}
              </span>
              <span className="text-fg-faint" style={{ fontSize: '0.72rem' }}>
                {hovered.item.name}
              </span>
            </>
          ) : (
            <span className="text-fg-prominent" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
              {hovered.item.kind === 'note' ? hovered.item.title : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface NoteLabelProps {
  x: number;
  y: number;
  fontSize: number;
  text: string;
  style: { boxFill: string; text: string };
}

/** Text widths are counted in "units": one Latin character = 1, so a line's
 *  width is units × ~0.58em. Full-width glyphs (Korean, Chinese, Japanese)
 *  are about 1em wide, i.e. ~1.75 units — counting characters alone made
 *  their labels overflow the box. */
const GLYPH_EM_PER_UNIT = 0.58;
const WIDE_GLYPH_UNITS = 1.75;
const WIDE_GLYPH = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/;

function textUnits(text: string): number {
  let units = 0;
  for (const glyph of text) units += WIDE_GLYPH.test(glyph) ? WIDE_GLYPH_UNITS : 1;
  return units;
}

/** How many leading characters of `text` fit in `maxUnits`. */
function fitLength(text: string, maxUnits: number): number {
  let units = 0;
  let length = 0;
  for (const glyph of text) {
    units += WIDE_GLYPH.test(glyph) ? WIDE_GLYPH_UNITS : 1;
    if (units > maxUnits) break;
    length += glyph.length;
  }
  return length;
}

/** Resting labels are one line, cut to this many units. */
const RESTING_LABEL_MAX_UNITS = 24;
/** Hover: the box grows to the whole title, wrapped this wide / this tall. */
const EXPANDED_LABEL_MAX_UNITS = 30;
const EXPANDED_LABEL_MAX_LINES = 5;
const LABEL_LINE_HEIGHT = 1.3;
const LABEL_BREAK_CHARS = /[ _\-./]/;

/** Wraps `text` into at most `maxLines` lines of `maxUnits`, preferring to
 *  break after a space, `_`, `-`, `.` or `/` in the back half of the line and
 *  hard-breaking otherwise; whatever doesn't fit ends the last line in "…". */
function wrapLabel(text: string, maxUnits: number, maxLines: number): string[] {
  const lines: string[] = [];
  let rest = text.trim();
  while (rest.length > 0 && lines.length < maxLines) {
    const isLastLine = lines.length === maxLines - 1;
    if (textUnits(rest) <= maxUnits) {
      lines.push(rest);
      break;
    }
    if (isLastLine) {
      lines.push(`${rest.slice(0, Math.max(1, fitLength(rest, maxUnits - 1))).trimEnd()}…`);
      break;
    }
    const maxChars = Math.max(1, fitLength(rest, maxUnits));
    let cut = maxChars;
    for (let i = maxChars - 1; i >= Math.floor(maxChars / 2); i--) {
      if (LABEL_BREAK_CHARS.test(rest[i])) {
        cut = i + 1;
        break;
      }
    }
    lines.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  return lines;
}

interface LabelBoxProps {
  x: number;
  y: number;
  lines: string[];
  fontSize: number;
  style: { boxFill: string; text: string };
  className?: string;
  extraStyle?: CSSProperties;
}

/** Size of the box `LabelBox` draws for `lines` — also what label placement
 *  reserves, so the two always agree. */
function labelBoxSize(lines: string[], fontSize: number): { width: number; height: number } {
  const padding = fontSize * 0.6;
  return {
    width: Math.max(...lines.map(textUnits)) * fontSize * GLYPH_EM_PER_UNIT + padding * 2,
    height: fontSize * LABEL_LINE_HEIGHT * lines.length + padding * 0.8,
  };
}

function shortNoteLabel(title: string): string {
  if (textUnits(title) <= RESTING_LABEL_MAX_UNITS) return title;
  return `${title.slice(0, fitLength(title, RESTING_LABEL_MAX_UNITS - 1)).trimEnd()}…`;
}

/** Rounded box with centered text lines. */
function LabelBox({ x, y, lines, fontSize, style, className, extraStyle }: LabelBoxProps) {
  const lineHeight = fontSize * LABEL_LINE_HEIGHT;
  const { width, height } = labelBoxSize(lines, fontSize);
  return (
    <>
      <rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={fontSize * 0.45}
        className={className}
        style={{ ...extraStyle, fill: style.boxFill, stroke: 'black', strokeWidth: 1 }}
      />
      <text
        textAnchor="middle"
        className={className}
        style={{ ...extraStyle, fill: style.text, fontSize, fontWeight: 600 }}
      >
        {/* `dy` (not dominant-baseline, which WebKit doesn't apply reliably to
            positioned tspans) drops the alphabetic baseline to the line's middle. */}
        {lines.map((line, index) => (
          <tspan key={index} x={x} y={y + (index - (lines.length - 1) / 2) * lineHeight} dy="0.35em">
            {line}
          </tspan>
        ))}
      </text>
    </>
  );
}

/** The hovered note's full title, drawn over everything else (an overlay after
 *  all the bubbles, so it's on top of neighbours without reordering them) and
 *  ignoring the pointer so it can't steal the hover. Doesn't drift with its
 *  bubble — it covers the resting box, so the few px of drift don't show. */
function ExpandedNoteLabel({
  x,
  y,
  fontSize,
  text,
  style,
  offset,
}: NoteLabelProps & { offset: { dx: number; dy: number } }) {
  const lines = wrapLabel(text, EXPANDED_LABEL_MAX_UNITS, EXPANDED_LABEL_MAX_LINES);
  return (
    <g
      pointerEvents="none"
      style={{ transform: `translate(${offset.dx}px, ${offset.dy}px)`, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.55))' }}
    >
      <LabelBox x={x} y={y} lines={lines} fontSize={fontSize} style={style} />
    </g>
  );
}

interface Crumb {
  label: string;
  /** Vault-relative folder path (`''` = the vault root). */
  path: string;
}

/** Vault root, then each folder down to `path`. */
function crumbsFor(path: string): Crumb[] {
  const segments = path === '' ? [] : path.split('/');
  return [
    { label: VAULT_ROOT_LABEL, path: '' },
    ...segments.map((segment, index) => ({ label: segment, path: segments.slice(0, index + 1).join('/') })),
  ];
}

/** Clickable path of the folder being viewed — every ancestor jumps straight
 *  back to it, the last crumb (where you are) is plain text. */
function Breadcrumbs({ crumbs, onNavigate }: { crumbs: Crumb[]; onNavigate: (path: string) => void }) {
  return (
    <nav
      aria-label="Folder path"
      className="flex max-w-full items-center gap-1 rounded-row border border-border-subtle bg-bg-panel px-1.5 py-0.5"
      style={{ fontSize: '0.72rem' }}
    >
      {crumbs.map((crumb, index) => {
        const isCurrent = index === crumbs.length - 1;
        return (
          <Fragment key={crumb.path}>
            {index > 0 && <CaretRight size={9} weight="bold" className="shrink-0 text-fg-faint" />}
            {isCurrent ? (
              <span aria-current="page" className="max-w-[140px] truncate text-fg-prominent">
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(crumb.path)}
                className="max-w-[140px] truncate text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
              >
                {crumb.label}
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
