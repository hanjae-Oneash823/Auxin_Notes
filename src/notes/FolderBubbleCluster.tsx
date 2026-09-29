import { useMemo, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import type { FolderNode } from '../vault/folderTree';

const CHART_WIDTH = 600;
const CHART_HEIGHT = 220;
const FIT_MARGIN = 0.97;
/** The packing search spirals outward in an ellipse matching this shape
 *  (sqrt of the box's aspect ratio, so area grows at the same rate as a
 *  circular spiral would) rather than a circle — a circular pack squeezed
 *  into a wide-short box wastes most of its width and only gets sized by
 *  the box's shorter dimension, making every bubble tiny. Only the search
 *  envelope is stretched; placed circles stay true circles. */
const SPIRAL_ASPECT_X = Math.sqrt(CHART_WIDTH / CHART_HEIGHT);
const SPIRAL_ASPECT_Y = 1 / SPIRAL_ASPECT_X;
const MAX_BUBBLE_RADIUS = 90;
const MIN_BUBBLE_RADIUS = 18;
/** Notes get a small, uniform radius rather than the folder palette's
 *  count-proportional sizing — they're leaves, not something with its own
 *  internal breakdown worth sizing by, so "small and clearly not a folder"
 *  matters more here than area-proportional accuracy. */
const NOTE_BUBBLE_RADIUS = 13;
const BUBBLE_PADDING = 4;
const MAX_SPIRAL_STEPS = 4000;
const SPIRAL_ANGLE_STEP = 0.34;
const SPIRAL_RADIUS_STEP = 1.4;
const LABEL_MIN_FONT_SIZE = 10;
const LABEL_MAX_FONT_SIZE = 22;
const HOVER_SCALE = 1.08;
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
}

type BubbleItem =
  | { kind: 'folder'; path: string; name: string; count: number }
  | { kind: 'note'; path: string; title: string };

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
interface BubbleNav {
  path: string;
  history: string[];
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
function packCircles(radii: number[]): { x: number; y: number }[] {
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
        x: spiralRadius * SPIRAL_ASPECT_X * Math.cos(angle),
        y: spiralRadius * SPIRAL_ASPECT_Y * Math.sin(angle),
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
export function FolderBubbleCluster({ root, onSelectNote }: FolderBubbleClusterProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [nav, setNav] = useState<BubbleNav>(ROOT_NAV);
  // Which way the last navigation went — picks the zoom-in vs zoom-out entry
  // animation for the freshly mounted bubble set (see bubbles-nav-in/-out,
  // global.css). Not reset on the initial render since nothing has animated
  // in yet to animate away from.
  const [navDirection, setNavDirection] = useState<'in' | 'out'>('in');

  function enterFolder(path: string) {
    setHoverIndex(null);
    setNavDirection('in');
    setNav((current) => ({ path, history: [...current.history, current.path] }));
  }

  function goBack() {
    setHoverIndex(null);
    setNavDirection('out');
    setNav((current) => {
      if (current.history.length === 0) return current;
      const previous = current.history[current.history.length - 1];
      return { path: previous, history: current.history.slice(0, -1) };
    });
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
    const noteItems: BubbleItem[] = noteRows.map((note) => ({ kind: 'note', path: note.path, title: note.title }));
    const items: BubbleItem[] = [...folderItems, ...noteItems];
    if (items.length === 0) return [];

    const maxFolderCount = folderItems.reduce(
      (max, item) => (item.kind === 'folder' ? Math.max(max, item.count) : max),
      1,
    );
    const radii = items.map((item) =>
      item.kind === 'folder'
        ? Math.max(MIN_BUBBLE_RADIUS, Math.sqrt(item.count / maxFolderCount) * MAX_BUBBLE_RADIUS)
        : NOTE_BUBBLE_RADIUS,
    );

    // Bigger bubbles pack tighter when placed first, so packing runs over a
    // radius-descending index order; positions are zipped back onto the
    // original items afterward rather than reordering `items` itself, which
    // would make hover/click handlers below harder to reason about.
    const order = items.map((_, index) => index).sort((a, b) => radii[b] - radii[a]);
    const orderedRadii = order.map((index) => radii[index]);
    const orderedPositions = packCircles(orderedRadii);

    const minX = Math.min(...orderedPositions.map((p, i) => p.x - orderedRadii[i]));
    const maxX = Math.max(...orderedPositions.map((p, i) => p.x + orderedRadii[i]));
    const minY = Math.min(...orderedPositions.map((p, i) => p.y - orderedRadii[i]));
    const maxY = Math.max(...orderedPositions.map((p, i) => p.y + orderedRadii[i]));
    const scale = Math.min(CHART_WIDTH / (maxX - minX), CHART_HEIGHT / (maxY - minY)) * FIT_MARGIN;
    const offsetX = CHART_WIDTH / 2 - ((minX + maxX) / 2) * scale;
    const offsetY = CHART_HEIGHT / 2 - ((minY + maxY) / 2) * scale;

    return order.map((originalIndex, i) => ({
      item: items[originalIndex],
      r: orderedRadii[i] * scale,
      x: orderedPositions[i].x * scale + offsetX,
      y: orderedPositions[i].y * scale + offsetY,
    }));
  }, [node]);

  const isAtRoot = nav.history.length === 0 && nav.path === '';

  if (bubbles.length === 0) {
    return (
      <div className="relative">
        {!isAtRoot && <BackButton label={node.name || VAULT_ROOT_LABEL} onClick={goBack} />}
        <span className="px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
          {isAtRoot ? 'no notes yet' : 'empty folder'}
        </span>
      </div>
    );
  }

  const hovered = hoverIndex !== null ? bubbles[hoverIndex] : null;
  const tooltipLeftPercent = hovered
    ? Math.min(100 - TOOLTIP_EDGE_CLAMP_PERCENT, Math.max(TOOLTIP_EDGE_CLAMP_PERCENT, (hovered.x / CHART_WIDTH) * 100))
    : 0;
  const tooltipTopPercent = hovered ? Math.max(0, ((hovered.y - hovered.r) / CHART_HEIGHT) * 100) : 0;

  return (
    <div className="relative">
      {!isAtRoot && <BackButton label={node.name || VAULT_ROOT_LABEL} onClick={goBack} />}
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        style={{ height: CHART_HEIGHT }}
        role="img"
        aria-label={isAtRoot ? 'Note counts per folder' : `Contents of ${node.name}`}
      >
        <g key={nav.path} className={navDirection === 'in' ? 'bubbles-nav-in' : 'bubbles-nav-out'}>
          {bubbles.map((bubble, index) => {
            const isHovered = hoverIndex === index;
            const item = bubble.item;
            const isFolder = item.kind === 'folder';
            const label = item.kind === 'folder' ? item.name : item.title;
            const countFontSize = Math.max(LABEL_MIN_FONT_SIZE, Math.min(LABEL_MAX_FONT_SIZE, bubble.r * 0.42));
            const nameFontSize = countFontSize * 0.48;
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

            const driftClassName = DRIFT_VARIANTS[index % DRIFT_VARIANTS.length];
            const driftStyle = { animationDelay: `-${(index * DRIFT_DELAY_STEP_SECONDS).toFixed(2)}s` };
            const fillColor =
              item.kind === 'folder'
                ? BUBBLE_FILL_VARIANTS[index % BUBBLE_FILL_VARIANTS.length]
                : 'var(--bubble-note-teal)';

            return (
              <g
                key={item.path}
                onPointerEnter={() => setHoverIndex(index)}
                onPointerLeave={() => setHoverIndex((current) => (current === index ? null : current))}
                onFocus={() => setHoverIndex(index)}
                onBlur={() => setHoverIndex((current) => (current === index ? null : current))}
                onClick={(event) =>
                  item.kind === 'folder' ? enterFolder(item.path) : onSelectNote(item.path, event.currentTarget)
                }
                tabIndex={0}
                role="img"
                aria-label={
                  item.kind === 'folder'
                    ? `${item.name}: ${item.count} ${item.count === 1 ? 'note' : 'notes'}`
                    : item.title
                }
                style={{
                  transformOrigin: `${bubble.x}px ${bubble.y}px`,
                  transform: isHovered ? `scale(${HOVER_SCALE})` : 'scale(1)',
                  transition: 'transform 150ms ease',
                  cursor: 'pointer',
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
                <circle
                  cx={bubble.x}
                  cy={bubble.y}
                  r={bubble.r}
                  stroke="black"
                  strokeWidth={BUBBLE_STROKE_WIDTH}
                  className={driftClassName}
                  style={{
                    ...driftStyle,
                    fill: fillColor,
                    filter: isHovered ? (isFolder ? HOVER_GLOW : NOTE_HOVER_GLOW) : 'none',
                    transition: 'filter 150ms ease',
                  }}
                />
                {countFits && item.kind === 'folder' && (
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
      </svg>

      {hovered && (
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
              {hovered.item.title}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Back (currently ${label})`}
      title={label}
      className="absolute left-0 top-0 z-10 flex items-center gap-1 rounded-row border border-border-subtle bg-bg-panel px-1.5 py-0.5 text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
      style={{ fontSize: '0.72rem' }}
    >
      <ArrowLeft size={11} weight="bold" />
      <span className="max-w-[140px] truncate">{label}</span>
    </button>
  );
}
