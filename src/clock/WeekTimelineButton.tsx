import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarBlank } from '@phosphor-icons/react';
import { useHoverTooltip } from '../layout/HoverTooltip';
import { WEEK_TIMELINE_WIDTH_PX } from './WeekFrame';
import { WeekTimeline } from './WeekTimeline';

/** Gap between the button and the popup under it, and the minimum margin to the window edge. */
const POPUP_GAP_PX = 6;
const WINDOW_MARGIN_PX = 8;
/** Portrait 1:2 — the grid stretches to fill whatever height this leaves under the header. */
const WEEK_TIMELINE_HEIGHT_PX = WEEK_TIMELINE_WIDTH_PX * 2;

/** The week button floating at the clock strip's left end. Its popup opens just under it; click outside or Esc closes it. */
export function WeekTimelineButton() {
  const [isOpen, setIsOpen] = useState(false);
  // Kept after closing, so the popup stays put while it animates out.
  const [anchor, setAnchor] = useState({ top: 0, left: 0, scale: 1 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const { hoverProps, hide, tooltip } = useHoverTooltip('Weekly timeline');

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popupRef.current?.contains(target) && !buttonRef.current?.contains(target)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && setIsOpen(false);
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  function toggle() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect || isOpen) return setIsOpen(false);
    const maxLeft = window.innerWidth - WEEK_TIMELINE_WIDTH_PX - WINDOW_MARGIN_PX;
    const top = rect.bottom + POPUP_GAP_PX;
    // Shrinks the whole popup (keeping 1:2) when the window is too short for it.
    const scale = Math.min(1, (window.innerHeight - top - WINDOW_MARGIN_PX) / WEEK_TIMELINE_HEIGHT_PX);
    setAnchor({ top, left: Math.max(WINDOW_MARGIN_PX, Math.min(rect.left, maxLeft)), scale });
    setIsOpen(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Weekly timeline"
        aria-expanded={isOpen}
        {...hoverProps}
        // The strip pans on pointer-down; this button must not start a pan.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          hide();
          toggle();
        }}
        className={`absolute left-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-row border transition-colors duration-panel ease-panel ${
          isOpen
            ? 'border-[color:var(--border-strong)] bg-bg-packet-active text-accent-link'
            : 'border-border bg-bg-packet-card text-fg-muted hover:border-[color:var(--border-strong)] hover:bg-bg-packet-active hover:text-fg-prominent'
        }`}
        style={{ boxShadow: 'var(--shadow-float)', cursor: 'pointer' }}
      >
        <CalendarBlank size={16} weight={isOpen ? 'fill' : 'regular'} />
      </button>
      {tooltip}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            // Same open/close timing as the dock popups and context menus: eases out in, a touch quicker out.
            <motion.div
              ref={popupRef}
              initial={{ opacity: 0, y: -8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, y: -6, scale: 0.985, transition: { duration: 0.1, ease: 'easeIn' } }}
              // A portal still bubbles React events to the strip, which would start a pan.
              onPointerDown={(event) => event.stopPropagation()}
              className="fixed z-40 box-content overflow-hidden border border-border bg-bg"
              style={{ top: anchor.top, left: anchor.left, width: WEEK_TIMELINE_WIDTH_PX * anchor.scale, height: WEEK_TIMELINE_HEIGHT_PX * anchor.scale, transformOrigin: 'top left', boxShadow: 'var(--shadow-float)', fontFamily: 'var(--font-family)' }}
            >
              <div style={{ width: WEEK_TIMELINE_WIDTH_PX, height: WEEK_TIMELINE_HEIGHT_PX, transform: `scale(${anchor.scale})`, transformOrigin: 'top left' }}>
                <WeekTimeline />
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
