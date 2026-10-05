import { useHoverTooltip } from '../layout/HoverTooltip';
import { xForTime, type ClockRange } from './clockGeometry';
import type { ClockBlock, ClockLane } from './clockBlocks';

/** The black outline that also separates back-to-back blocks (two meetings in a row). */
const BLOCK_BORDER_PX = 1;
/** Share of the original color kept in an ended block; the rest is black. */
const PAST_COLOR_PERCENT = 45;

/** The color mixed toward black — stays fully opaque, unlike dimming by opacity. */
export const darkened = (color: string) => `color-mix(in srgb, ${color} ${PAST_COLOR_PERCENT}%, #000)`;

/** A session's body and outline, as in Mycelium's weekly timetable; a live one gets a brighter outline. */
export const SESSION_BODY = '#2a2a2a';
export const SESSION_BORDER = 'rgba(255, 255, 255, 0.25)';
export const LIVE_SESSION_BORDER = 'rgba(255, 255, 255, 0.5)';
/** Per-node time bars inside a session: thick, centered, and dimmer until the node is finished. */
export const SEGMENT_HEIGHT_PX = 10;
const MIN_SEGMENT_WIDTH_PX = 3;
export const UNFINISHED_SEGMENT_PERCENT = 35;
export const FINISHED_SEGMENT_PERCENT = 80;
export const segmentColor = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/** Vertical placement of each lane: planned on top, actual below, a 1px gap between; sleep spans both. */
const LANE_STYLE: Record<ClockLane, { top: number | string; bottom: number | string }> = {
  planned: { top: 4, bottom: 'calc(50% + 1px)' },
  actual: { top: 'calc(50% + 1px)', bottom: 4 },
  sleep: { top: 4, bottom: 4 },
};

interface ClockBlockViewProps {
  block: ClockBlock;
  /** The strip's current center and width, to place a session's node bars. */
  centerMs: number;
  stripWidthPx: number;
  range: ClockRange;
  leftPx: number;
  widthPx: number;
  /** Already ended — drawn in a darkened shade of its color. */
  isPast: boolean;
}

/** One block on the clock strip: a bar whose name appears in Auxin's hover
 *  tooltip, rendered beside the bar rather than inside it. A planned block is
 *  filled with its arc color; a session is dark and holds one bar per node worked. */
export function ClockBlockView({ block, centerMs, stripWidthPx, range, leftPx, widthPx, isPast }: ClockBlockViewProps) {
  const { hoverProps, hide, tooltip } = useHoverTooltip(block.label);
  const isSession = block.lane === 'actual';
  const color = block.color;
  return (
    <>
      <div
        role="img"
        aria-label={block.label}
        {...hoverProps}
        // Starting a pan from a block must dismiss the label, which would
        // otherwise hang in place while the blocks slide away.
        onPointerDown={hide}
        className="absolute rounded-row hover:brightness-125"
        style={{
          ...LANE_STYLE[block.lane],
          left: leftPx,
          width: widthPx,
          background: isSession ? SESSION_BODY : isPast ? darkened(color) : color,
          border: isSession ? `1.5px solid ${block.isLive ? LIVE_SESSION_BORDER : SESSION_BORDER}` : `${BLOCK_BORDER_PX}px solid #000`,
          overflow: 'hidden',
          // Only the hover brighten animates. Left of this, the default
          // `transition-property: all` made every pan step ease in over 0.3s —
          // the blocks trailed the pointer.
          transitionProperty: 'filter',
          transitionDuration: 'var(--duration-panel)',
          transitionTimingFunction: 'var(--ease-panel)',
        }}
      >
        {block.segments.map((segment) => {
          const segmentLeft = xForTime(segment.startMs, centerMs, stripWidthPx, range) - leftPx;
          const segmentWidth = xForTime(segment.endMs, centerMs, stripWidthPx, range) - leftPx - segmentLeft;
          return (
            <span
              key={segment.id}
              className="pointer-events-none absolute top-1/2 -translate-y-1/2"
              style={{
                left: segmentLeft,
                width: Math.max(MIN_SEGMENT_WIDTH_PX, segmentWidth),
                height: SEGMENT_HEIGHT_PX,
                background: segmentColor(segment.color, segment.isFinished ? FINISHED_SEGMENT_PERCENT : UNFINISHED_SEGMENT_PERCENT),
              }}
            />
          );
        })}
      </div>
      {tooltip}
    </>
  );
}
