import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

interface SidebarPacketProps {
  /** Small heading shown in the packet's header row; omit for a bare card. */
  title?: string;
  /** Right-aligned header controls (icon buttons). */
  actions?: ReactNode;
  /** Let the packet grow to fill the sidebar's remaining height, giving its
   *  body a scroll container (used by the file tree). */
  isFill?: boolean;
  children: ReactNode;
}

/** A rounded card inside a sidebar — the unit the left/right panels are
 *  organised into. Sits one tone above the grey panel behind it. */
export function SidebarPacket({ title, actions, isFill = false, children }: SidebarPacketProps) {
  return (
    <section
      className={`flex flex-col rounded-panel bg-bg-packet ${isFill ? 'min-h-0 flex-1' : 'shrink-0'}`}
    >
      {(title || actions) && (
        <header className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-2.5">
          <span className="truncate text-fg-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>
            {title}
          </span>
          {actions && <div className="flex items-center gap-0.5">{actions}</div>}
        </header>
      )}
      {/* A fill packet hosts a scroll container (the file tree), so it drops
          right padding: a parent's padding would inset the nested
          scrollbar from the packet's edge instead of leaving it flush. */}
      <div
        className={`flex flex-col pb-1.5 pl-1.5 ${isFill ? 'min-h-0 flex-1 pr-0' : 'pr-1.5'} ${
          title || actions ? '' : 'pt-1.5'
        }`}
      >
        {children}
      </div>
    </section>
  );
}

interface PacketIconButtonProps {
  title: string;
  onClick: () => void;
  children: ReactNode;
}

const TOOLTIP_DELAY_MS = 150;
const TOOLTIP_GAP_PX = 6;

interface TooltipAnchor {
  x: number;
  y: number;
}

/** Header icon button with a custom tooltip (instead of the native `title`
 *  bubble): a black-on-white label centered above the button. The label uses
 *  `position: fixed` with coordinates measured from the button on hover, so
 *  it escapes the sidebar's `overflow-x-hidden` scroll container and can
 *  draw over the sidebar's edge instead of being clipped by it. */
export function PacketIconButton({ title, onClick, children }: PacketIconButtonProps) {
  const [anchor, setAnchor] = useState<TooltipAnchor>({ x: 0, y: 0 });
  const [isOpen, setIsOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function showTooltip(event: ReactMouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setAnchor({ x: rect.left + rect.width / 2, y: rect.top - TOOLTIP_GAP_PX });
      setIsOpen(true);
    }, TOOLTIP_DELAY_MS);
  }

  // The anchor is kept on close so the label can fade out in place.
  function hideTooltip() {
    clearTimer();
    setIsOpen(false);
  }

  useEffect(() => clearTimer, []);

  return (
    <>
      <button
        type="button"
        aria-label={title}
        onClick={() => {
          hideTooltip();
          onClick();
        }}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className="flex h-6 w-6 items-center justify-center rounded-row text-fg-faint transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent"
      >
        {children}
      </button>
      {/* Always mounted so close can transition too. Only opacity/transform
          animate (never left/top), so repositioning while hidden doesn't
          slide. Open eases out with a slight rise + scale; close is a touch
          quicker. */}
      <span
        role="tooltip"
        aria-hidden={!isOpen}
        className="pointer-events-none fixed z-50 whitespace-nowrap rounded-row bg-white px-2 py-1 text-black shadow-[var(--shadow-float)]"
        style={{
          left: anchor.x,
          top: anchor.y,
          transformOrigin: 'bottom center',
          transform: isOpen ? 'translate(-50%, -100%) scale(1)' : 'translate(-50%, calc(-100% + 4px)) scale(0.94)',
          opacity: isOpen ? 1 : 0,
          transition: isOpen
            ? 'opacity 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.22, 1, 0.36, 1)'
            : 'opacity 90ms ease-in, transform 90ms ease-in',
          fontSize: '0.72rem',
          fontWeight: 500,
        }}
      >
        {title}
      </span>
    </>
  );
}
