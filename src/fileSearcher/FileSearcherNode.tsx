import { motion } from 'framer-motion';
import type { NoteSummary } from '../db/queries/notes';
import type { FolderNode } from '../vault/folderTree';

/** `newNote` is the "new note here" row that leads every level (see
 *  FileSearcherOverlay.tsx) — it creates an untitled note in that folder. */
export type FileSearcherItem =
  | { kind: 'folder'; node: FolderNode }
  | { kind: 'note'; note: NoteSummary }
  | { kind: 'newNote' };

const NEW_NOTE_LABEL = 'new note here';

export const NODE_SIZE_PX = 28;
export const NODE_SPACING_PX = 60;
/** Space between an icon and its name chip. */
export const CHIP_GAP_PX = 16;
/** The chip starts this far right of the list's center line (half the icon
 *  plus the gap), so it can use at most half the list's width minus this —
 *  any wider and the list container's `overflow-hidden` clips it. `cqw`
 *  resolves against that container (FileSearcherOverlay.tsx marks it as
 *  one), so this tracks the window's real width instead of a fixed guess. */
const CHIP_MAX_WIDTH = `calc(50cqw - ${NODE_SIZE_PX / 2 + CHIP_GAP_PX}px)`;
/** The dot inside a hub note's circle — marks the folder's pinned hub apart
 *  from ordinary notes, in either focus state. */
const HUB_DOT_PX = 8;

/** Mirror --accent-tag and --accent-link (tokens.css) as RGB triplets — the
 *  same colors the sidepane's FolderTree.tsx gives folder and hub rows, so a
 *  folder or hub reads the same in both places. Hand-duplicated for the same
 *  reason as NODE_TRANSITION below. Plain notes stay white, so the two
 *  colored kinds stand out against them. */
const FOLDER_RGB = '171, 229, 101';
const HUB_RGB = '77, 200, 242';
const CANVAS_RGB = '201, 150, 95';
const NOTE_RGB = '255, 255, 255';
const ICON_BORDER_ALPHA = 0.5;
const GLOW_ALPHA = 0.35;
const BLACK = 'rgba(0, 0, 0, 1)';
/** The small square inside a canvas note's circle — echoes the 2D-board
 *  shape, same role as HUB_DOT_PX's circle marks a hub. */
const CANVAS_MARK_PX = 8;

/** Mirrors --duration-panel/--ease-panel (tokens.css) — framer-motion can't
 *  read CSS custom properties, so the cubic-bezier is hand-duplicated here,
 *  same as FolderTree.tsx's ROW_ANIM already does. */
export const NODE_TRANSITION = { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const };

interface FileSearcherNodeProps {
  item: FileSearcherItem;
  /** Signed distance from the focused item, already wrap-adjusted to the
   *  shortest direction around the loop — 0 means centered/focused. */
  offset: number;
  /** Which side a newly mounted node enters from (1 = below, -1 = above), or
   *  0 when the visible set changed for some other reason (new level, new
   *  filter results). On a plain arrow-key step a node only ever newly mounts
   *  at the extreme edge of the visible window, and enters from that same
   *  side — reading as scrolling into place alongside its already-mounted
   *  siblings, which are simultaneously animating their own `y` by one slot.
   *  On a wrap (FileSearcherOverlay.tsx flips the side) nodes can mount
   *  anywhere in the window, and all enter from the side the list is
   *  rewinding from. When it's 0 (a wholesale list swap), the node just pops
   *  in already at its target spot, matching the level-change slide that's
   *  already happening one level up. */
  scrollDirection: -1 | 0 | 1;
}

/** The label a row's chip shows — also what the filter matches against. */
export function itemName(item: FileSearcherItem): string {
  if (item.kind === 'folder') return item.node.name;
  return item.kind === 'note' ? item.note.title : NEW_NOTE_LABEL;
}

function accentRgb(item: FileSearcherItem): string {
  if (item.kind === 'folder') return FOLDER_RGB;
  if (item.kind === 'note' && item.note.isHub) return HUB_RGB;
  if (item.kind === 'note' && item.note.isCanvas) return CANVAS_RGB;
  return NOTE_RGB;
}

function rgba(rgb: string, alpha: number): string {
  return `rgba(${rgb}, ${alpha})`;
}

/** One row of the vertical list: an icon (square for folders, circle for
 *  notes — the app's own "no border-radius except circular" law), its
 *  center pinned to the window's own horizontal center, with its name in a
 *  small chip to the right. Folders are green squares carrying their note
 *  count, hubs are blue circles, plain notes white, and the leading "new
 *  note here" row a white circle with a "+" — the focused row fills
 *  its icon with that color and glows in it. The chip's own black fill is
 *  the only opaque surface in the whole popup now that the window itself is
 *  transparent (see src-tauri/src/lib.rs and filesearcher.html) — so rows
 *  dim by changing the chip's text color, never its opacity, which would let
 *  the app behind the panel show through the name. Only the focused chip
 *  keeps a visible border, so the rest of the list doesn't read as a stack
 *  of boxes. Fading toward the list's edges is the list container's mask's
 *  job instead.
 *
 *  The wrapper's `width` is pinned to the icon's own size rather than left
 *  to shrink-to-fit its content — a flex-row's children aren't clipped to
 *  that width (the chip just overflows rightward in normal flow), but
 *  without this the wrapper's own shrink-to-fit sizing would still expand
 *  to the chip's width, and the fixed `x` offset below (which assumes a
 *  width of exactly NODE_SIZE_PX) would then under-shift it — pushing the
 *  icon off-center by an amount that varies with each row's own name
 *  length. */
export function FileSearcherNode({ item, offset, scrollDirection }: FileSearcherNodeProps) {
  const distance = Math.abs(offset);
  const isFocused = offset === 0;
  const scale = Math.max(0.6, 1.25 - distance * 0.2);
  const isHub = item.kind === 'note' && item.note.isHub;
  const isCanvas = item.kind === 'note' && item.note.isCanvas;
  const accent = accentRgb(item);
  // What sits inside the icon (a folder's count, a hub's dot, the new-note
  // row's "+"): black on the
  // focused row's solid fill, the accent itself on an unfocused black one.
  const inkColor = isFocused ? BLACK : rgba(accent, 1);

  return (
    <motion.div
      className="absolute left-1/2 top-1/2 flex flex-row items-center"
      style={{ width: NODE_SIZE_PX, gap: CHIP_GAP_PX }}
      initial={
        scrollDirection === 0
          ? false
          : {
              x: -(NODE_SIZE_PX / 2),
              y: (offset + scrollDirection) * NODE_SPACING_PX - NODE_SIZE_PX / 2,
              opacity: 0,
            }
      }
      animate={{
        x: -(NODE_SIZE_PX / 2),
        y: offset * NODE_SPACING_PX - NODE_SIZE_PX / 2,
        opacity: 1,
      }}
      transition={NODE_TRANSITION}
    >
      <motion.div
        className={`flex shrink-0 items-center justify-center border ${item.kind === 'folder' ? 'rounded-none' : 'rounded-full'}`}
        style={{ width: NODE_SIZE_PX, height: NODE_SIZE_PX }}
        initial={false}
        animate={{
          scale,
          backgroundColor: isFocused ? rgba(accent, 1) : BLACK,
          borderColor: rgba(accent, isFocused ? 1 : ICON_BORDER_ALPHA),
          boxShadow: `0 0 ${isFocused ? '20px 3px' : '0 0'} ${rgba(accent, isFocused ? GLOW_ALPHA : 0)}`,
        }}
        transition={NODE_TRANSITION}
      >
        {item.kind === 'folder' && item.node.noteCount > 0 && (
          <motion.span
            className="font-bold leading-none tabular-nums"
            style={{ fontSize: '0.62rem' }}
            initial={false}
            animate={{ color: inkColor }}
            transition={NODE_TRANSITION}
          >
            {item.node.noteCount}
          </motion.span>
        )}
        {isHub && (
          <motion.span
            className="rounded-full"
            style={{ width: HUB_DOT_PX, height: HUB_DOT_PX }}
            initial={false}
            animate={{ backgroundColor: inkColor }}
            transition={NODE_TRANSITION}
          />
        )}
        {isCanvas && (
          <motion.span
            style={{ width: CANVAS_MARK_PX, height: CANVAS_MARK_PX }}
            initial={false}
            animate={{ backgroundColor: inkColor }}
            transition={NODE_TRANSITION}
          />
        )}
        {item.kind === 'newNote' && (
          <motion.span
            className="leading-none"
            // A text "+" sits on the font's math axis, a little below its line
            // box's middle — so flex centering alone leaves it low in the circle.
            style={{ fontSize: '0.95rem', y: '-0.07em' }}
            initial={false}
            animate={{ color: inkColor }}
            transition={NODE_TRANSITION}
          >
            +
          </motion.span>
        )}
      </motion.div>
      <motion.span
        className="flex shrink-0 items-baseline gap-2 border bg-black px-2 py-0.5 text-left text-white"
        style={{ fontSize: '0.72rem', maxWidth: CHIP_MAX_WIDTH }}
        initial={false}
        animate={{
          borderColor: isFocused ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0)',
          color: isFocused ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.6)',
        }}
        transition={NODE_TRANSITION}
      >
        <span className="min-w-0 break-words">{itemName(item)}</span>
        {item.kind === 'folder' && <span className="shrink-0 opacity-50">›</span>}
      </motion.span>
    </motion.div>
  );
}
