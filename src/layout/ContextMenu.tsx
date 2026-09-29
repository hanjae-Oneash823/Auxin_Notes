import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CaretRight, Folder } from '@phosphor-icons/react';
import { CountBadge } from './CountBadge';

export interface ContextMenuItem {
  label: string;
  onSelect?: () => void;
  /** Colors the item as a destructive action (delete, etc). */
  danger?: boolean;
  /** Turns the item into a folder-style row that opens these items in a
   *  flyout to its side on hover (nesting to any depth). Picking an item
   *  anywhere in the tree closes the whole menu. */
  submenu?: ContextMenuItem[];
  /** A count shown at a submenu row's right end. */
  badge?: number;
  /** A non-interactive, faint placeholder row (e.g. "empty"). */
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  /** Forwarded to the root element — lets a hover-triggered caller (unlike
   *  the click-triggered right-click menus) keep the menu open while the
   *  pointer is over it, not just over the element that opened it. Flyouts
   *  are DOM descendants of the root, so hovering one counts as hovering it. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/** Same open/close timing as HoverTooltip.tsx's own floating label — the
 *  closest analogous piece of floating chrome — so the app's fade+scale
 *  popups all read as one motion language rather than each picking its own
 *  feel. Opening eases out; closing is a touch quicker, matching a dismissal
 *  reading as snappier than an appearance. */
const OPEN_TRANSITION = 'opacity 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.22, 1, 0.36, 1)';
const CLOSE_TRANSITION = 'opacity 90ms ease-in, transform 90ms ease-in';
const CLOSE_ANIMATION_MS = 90;
/** Grace period before a flyout closes when the pointer leaves its row — long
 *  enough to cross the 1px seam between row and flyout without a flicker. */
const SUBMENU_CLOSE_DELAY_MS = 120;
const VIEWPORT_MARGIN_PX = 8;
/** Flyout's own top border + padding, so its first item lines up with the
 *  row that opened it. */
const FLYOUT_TOP_OFFSET_PX = 5;
const PANEL_CLASS = 'min-w-[160px] max-w-[240px] border border-border bg-bg py-1';
const ROW_CLASS = 'block w-full whitespace-normal break-words px-3 py-1.5 text-left transition-colors duration-panel ease-panel';

type PickHandler = (action?: () => void) => void;

interface MenuItemsProps {
  items: ContextMenuItem[];
  onPick: PickHandler;
}

/** A row that opens `item.submenu` in a flyout on hover. The flyout is
 *  `position: fixed` (measured against the row, then clamped into the
 *  viewport, flipping to the left edge when there's no room on the right) so
 *  a long list scrolls inside itself instead of being clipped by the menu —
 *  which relies on the root menu resting at `transform: none`, since any
 *  transform on an ancestor would become the flyout's containing block. */
function SubmenuRow({ item, onPick }: { item: ContextMenuItem; onPick: PickHandler }) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  function cancelClose() {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function open() {
    cancelClose();
    setIsOpen(true);
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setIsOpen(false), SUBMENU_CLOSE_DELAY_MS);
  }

  useEffect(() => cancelClose, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    const wrapper = wrapperRef.current;
    const flyout = flyoutRef.current;
    if (!wrapper || !flyout) return;
    const row = wrapper.getBoundingClientRect();
    const fitsRight = row.right + flyout.offsetWidth <= window.innerWidth - VIEWPORT_MARGIN_PX;
    const left = fitsRight ? row.right : Math.max(VIEWPORT_MARGIN_PX, row.left - flyout.offsetWidth);
    const maxTop = window.innerHeight - flyout.offsetHeight - VIEWPORT_MARGIN_PX;
    setPosition({ left, top: Math.max(VIEWPORT_MARGIN_PX, Math.min(row.top - FLYOUT_TOP_OFFSET_PX, maxTop)) });
  }, [isOpen]);

  return (
    <div ref={wrapperRef} onMouseEnter={open} onMouseLeave={scheduleClose}>
      <button
        type="button"
        onClick={open}
        className={`${ROW_CLASS} flex items-center gap-2 hover:bg-border-subtle hover:text-fg-prominent ${
          isOpen ? 'bg-border-subtle text-fg-prominent' : 'text-fg-muted'
        }`}
      >
        <Folder size={12} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badge ? <CountBadge count={item.badge} size="sm" /> : null}
        <CaretRight size={10} weight="bold" className="shrink-0" />
      </button>
      {isOpen && item.submenu && (
        <div
          ref={flyoutRef}
          className={`menu-flyout fixed z-50 max-h-[calc(100vh-16px)] overflow-y-auto ${PANEL_CLASS}`}
          style={position ?? { left: 0, top: 0, visibility: 'hidden' }}
        >
          <MenuItems items={item.submenu} onPick={onPick} />
        </div>
      )}
    </div>
  );
}

function MenuItems({ items, onPick }: MenuItemsProps) {
  return (
    <>
      {items.map((item, index) => {
        const key = `${index}:${item.label}`;
        if (item.submenu) return <SubmenuRow key={key} item={item} onPick={onPick} />;
        if (item.disabled) {
          return (
            <div key={key} className={`${ROW_CLASS} text-fg-faint`}>
              {item.label}
            </div>
          );
        }
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(item.onSelect)}
            className={`${ROW_CLASS} hover:bg-border-subtle ${
              item.danger ? 'text-accent-link-broken' : 'text-fg-muted hover:text-fg-prominent'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </>
  );
}

/**
 * Minimal fixed-position right-click menu matching the app's own floating
 * chrome (the disambiguation/preview cards in linkChipWidget.ts) rather than
 * a native OS menu, which can't be restyled to fit the hairline-border,
 * no-radius look used everywhere else. Closes on any outside click or
 * Escape, and nudges itself back on-screen if it would render past the
 * viewport edge. Items with a `submenu` open cascading flyouts on hover.
 *
 * Every close path (outside click, Escape, picking an item) goes through
 * `requestClose` rather than calling `onClose` straight away, so the menu
 * stays mounted for the exit transition instead of vanishing on the frame
 * the close was triggered — `onClose` (which actually unmounts it, via
 * whatever state the caller closed over) only fires once that transition
 * finishes.
 */
export function ContextMenu({ x, y, items, onClose, onMouseEnter, onMouseLeave }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  // Mounts in its closed (scaled-down, transparent) style, then flips to
  // open on the next frame so the transition actually has a "from" state to
  // animate away from — a synchronous open would just paint pre-opened.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  function requestClose() {
    if (closeTimerRef.current !== null) return;
    setIsOpen(false);
    closeTimerRef.current = window.setTimeout(onClose, CLOSE_ANIMATION_MS);
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) requestClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') requestClose();
    }
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    // `offsetWidth`/`offsetHeight` are the menu's untransformed layout size
    // — unlike `getBoundingClientRect()`, they aren't skewed by the
    // intro/exit scale transform below, which would otherwise nudge the
    // menu using its shrunk mid-animation size instead of its resting one.
    const overflowX = x + menu.offsetWidth - window.innerWidth;
    const overflowY = y + menu.offsetHeight - window.innerHeight;
    if (overflowX > 0) menu.style.left = `${Math.max(0, x - overflowX)}px`;
    if (overflowY > 0) menu.style.top = `${Math.max(0, y - overflowY)}px`;
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`fixed z-50 ${PANEL_CLASS}`}
      style={{
        left: x,
        top: y,
        fontFamily: 'var(--font-family)',
        fontSize: '0.8rem',
        transformOrigin: 'top left',
        opacity: isOpen ? 1 : 0,
        // `none` (not `scale(1)`) at rest: a resting transform would make
        // this the containing block for the `position: fixed` flyouts.
        transform: isOpen ? 'none' : 'scale(0.92) translateY(-4px)',
        transition: isOpen ? OPEN_TRANSITION : CLOSE_TRANSITION,
      }}
    >
      <MenuItems
        items={items}
        onPick={(action) => {
          action?.();
          requestClose();
        }}
      />
    </div>
  );
}
