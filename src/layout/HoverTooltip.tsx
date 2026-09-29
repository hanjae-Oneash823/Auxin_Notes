import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

const TOOLTIP_DELAY_MS = 150;
const TOOLTIP_GAP_PX = 6;
/** Room a label needs above its element; less than this and it flips below. */
const TOOLTIP_MIN_ROOM_ABOVE_PX = 36;
/** Distance from the window's right edge inside which a centered label could
 *  overflow it, so the label right-aligns to the element instead. */
const TOOLTIP_EDGE_MARGIN_PX = 80;

interface TooltipAnchor {
  x: number;
  y: number;
  isBelow: boolean;
  isEndAligned: boolean;
}

interface HoverTooltip {
  /** Spread onto the element the tooltip describes. */
  hoverProps: {
    onMouseEnter: (event: ReactMouseEvent<Element>) => void;
    onMouseLeave: () => void;
  };
  /** Dismiss immediately (e.g. on click). */
  hide: () => void;
  /** Render this anywhere in the tree — it positions itself with `fixed`. */
  tooltip: ReactNode;
}

/** Custom tooltip (instead of the native `title` bubble): a black-on-white
 *  label centered above the hovered element. It uses `position: fixed` with
 *  coordinates measured from the element on hover, so it escapes a sidebar's
 *  `overflow-x-hidden` scroll container and can draw over its edge instead
 *  of being clipped by it. Always mounted so close can transition too; only
 *  opacity/transform animate (never left/top), so repositioning while hidden
 *  doesn't slide. Open eases out with a slight rise + scale; close is a
 *  touch quicker. */
export function useHoverTooltip(label: string): HoverTooltip {
  const [anchor, setAnchor] = useState<TooltipAnchor>({ x: 0, y: 0, isBelow: false, isEndAligned: false });
  const [isOpen, setIsOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function show(event: ReactMouseEvent<Element>) {
    const rect = event.currentTarget.getBoundingClientRect();
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      const isBelow = rect.top < TOOLTIP_MIN_ROOM_ABOVE_PX;
      const isEndAligned = window.innerWidth - rect.right < TOOLTIP_EDGE_MARGIN_PX;
      setAnchor({
        x: isEndAligned ? rect.right : rect.left + rect.width / 2,
        y: isBelow ? rect.bottom + TOOLTIP_GAP_PX : rect.top - TOOLTIP_GAP_PX,
        isBelow,
        isEndAligned,
      });
      setIsOpen(true);
    }, TOOLTIP_DELAY_MS);
  }

  // The anchor is kept on close so the label can fade out in place.
  function hide() {
    clearTimer();
    setIsOpen(false);
  }

  useEffect(() => clearTimer, []);

  const translateX = anchor.isEndAligned ? '-100%' : '-50%';
  // Rests 4px toward its element while closed, then rises/settles into place.
  const restingY = anchor.isBelow ? '0px' : '-100%';
  const closedY = anchor.isBelow ? '-4px' : 'calc(-100% + 4px)';

  const tooltip = (
    <span
      role="tooltip"
      aria-hidden={!isOpen}
      className="pointer-events-none fixed z-50 whitespace-nowrap rounded-row bg-white px-2 py-1 text-black shadow-[var(--shadow-float)]"
      style={{
        left: anchor.x,
        top: anchor.y,
        transformOrigin: `${anchor.isBelow ? 'top' : 'bottom'} ${anchor.isEndAligned ? 'right' : 'center'}`,
        transform: isOpen
          ? `translate(${translateX}, ${restingY}) scale(1)`
          : `translate(${translateX}, ${closedY}) scale(0.94)`,
        opacity: isOpen ? 1 : 0,
        transition: isOpen
          ? 'opacity 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.22, 1, 0.36, 1)'
          : 'opacity 90ms ease-in, transform 90ms ease-in',
        fontSize: '0.72rem',
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  );

  return { hoverProps: { onMouseEnter: show, onMouseLeave: hide }, hide, tooltip };
}
