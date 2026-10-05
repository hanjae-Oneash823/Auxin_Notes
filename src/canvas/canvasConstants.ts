/** Cards size themselves to their content (see `CanvasCard.tsx`) within these
 *  bounds — width grows with the longest line up to the max, then text wraps
 *  and height takes over. The DEFAULT_* pair is only the placeholder `w`/`h`
 *  a new card is stored with (and centered by) until its first measurement
 *  overwrites it. */
export const MIN_CARD_WIDTH = 120;
export const MIN_CARD_HEIGHT = 40;
export const MAX_CARD_WIDTH = 360;
export const DEFAULT_CARD_WIDTH = 200;
/** Title cards hug their text up to this width, then wrap. */
export const TITLE_CARD_MAX_WIDTH = 720;
export const TITLE_CARD_MIN_WIDTH = 48;
export const OPTIMIZE_ANIMATION_MS = 400;
/** When cards are selected, the ones (and arrows) unrelated to the selection fade to this opacity. */
export const DIMMED_CARD_OPACITY = 0.3;
export const DIMMED_ARROW_OPACITY = 0.15;
/** A dragged card snaps to another's edge or center within this many screen px. */
export const SNAP_THRESHOLD_PX = 6;
export const SNAP_GUIDE_COLOR = '#ff6ea8';
/** How far a guide line runs past the cards it joins, in world px. */
export const SNAP_GUIDE_OVERSHOOT_PX = 16;
/** How many times "optimize" re-runs the layout, each pass animated. */
export const OPTIMIZE_PASSES = 4;
/** One press of the layout toolbar's rotate button. */
export const ROTATE_STEP_DEGREES = 30;
export const STICKY_CARD_BG = '#f5d547';
export const WARNING_CARD_BG = '#e0685a';
/** Note/PDF cards hug their title up to this width, then the title wraps. */
export const LINK_CARD_MAX_WIDTH = 240;
export const IMAGE_CARD_WIDTH = 280;
export const MIN_IMAGE_WIDTH = 60;
export const MAX_IMAGE_WIDTH = 2000;
/** World-space offset between cards when several images are added at once. */
export const IMAGE_STAGGER_PX = 24;
export const DEFAULT_CARD_HEIGHT = 48;

/** Hairline card border — constant across states (selection is a ring, not a
 *  wider border) so selecting a card never changes its measured size. */
export const CARD_BORDER_PX = 1;

export const MIN_ZOOM = 0.2;
/** Zoomed in past ~1.5x the board's text and arrows go soft: the webview draws
 *  the scaled layer at low resolution and stretches it (cause not found —
 *  neither `will-change` nor animations are involved, and CSS `zoom` instead
 *  of `transform: scale()` broke the layout). Capped here where it's still
 *  acceptable; zooming out stays sharp. */
export const MAX_ZOOM = 1.5;
export const ZOOM_STEP = 1.15;
export const VIEW_ANIMATION_MS = 300;
/** Screen px kept clear around the cards by "zoom to fit". */
export const FIT_PADDING_PX = 80;
/** Height the bottom toolbars cover; "zoom to fit" frames the cards above it. */
export const TOOLBAR_INSET_PX = 90;
/** Screen px the find-on-board box covers at the top edge. */
export const SEARCH_BAR_INSET_PX = 52;

/** Pointer-travel distance (screen px) below which a background or card
 *  pointerdown/up pair counts as a plain click rather than a drag — shared
 *  by the marquee-select click check and the click-into-multiselect
 *  narrowing check in CanvasView.tsx/CanvasCard.tsx. */
export const DRAG_CLICK_THRESHOLD_PX = 4;

/** How much `arrowPath.ts` rounds each bend in an arrow's route — shared by
 *  both `CanvasArrow.tsx` (the committed arrow) and `CanvasView.tsx`'s
 *  in-progress dashed preview, so a drawn-then-released arrow doesn't
 *  visibly change shape the moment it's dropped. */
export const ARROW_CORNER_RADIUS = 12;

/** Arrow line, arrowhead, label and in-progress preview all share this. */
/** The arrow color of a board that hasn't picked one. */
export const ARROW_COLOR = '#5cc44c';
export const ARROW_COLOR_CHOICES = [
  { name: 'Green', value: ARROW_COLOR },
  { name: 'Blue', value: '#4dc8f2' },
  { name: 'Grey', value: '#a3a3aa' },
  { name: 'Amber', value: '#e9bc61' },
  { name: 'Red', value: '#e0685a' },
  { name: 'Purple', value: '#b18cf5' },
] as const;
/** Labels wrap onto further lines past this width (and stop at the line cap, ending in "…"). */
export const ARROW_LABEL_MAX_WIDTH = 140;
export const ARROW_LABEL_MAX_LINES = 4;
export const ARROW_LABEL_FONT_PX = 14;
export const ARROW_LABEL_LINE_HEIGHT_PX = 16;
/** Width of the box a label is typed into. */
export const ARROW_LABEL_INPUT_WIDTH = ARROW_LABEL_MAX_WIDTH;
export const ARROW_STROKE_PX = 1.5;
export const ARROW_HOVER_STROKE_PX = 2.5;
/** Width of the invisible line around an arrow that catches right-clicks. */
export const ARROW_HIT_WIDTH_PX = 14;

/** World-space offset a duplicated card lands at, so the copy is visibly
 *  distinct from (rather than hidden under) its original. */
export const DUPLICATE_OFFSET_PX = 24;

/** Height of a group frame's title strip (the drag handle). */
export const GROUP_HEADER_H = 38;
/** Breathing room between a group's cards and its frame's edge. */
export const GROUP_PADDING_PX = 24;
/** Least clear space a layout leaves between a group's frame and anything else. */
export const GROUP_CLEARANCE_PX = 32;

/** A group whose frame is smaller than this on screen (longest side) collapses to its title. */
export const GROUP_SUMMARY_MAX_SCREEN_PX = 340;
