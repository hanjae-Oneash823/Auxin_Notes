import type { ReactNode } from 'react';
import { ResizeHandle } from './ResizeHandle';
import { SIDEBAR_TOGGLE_EASING, SIDEBAR_TOGGLE_MS, usePanelLayoutStore } from './panelLayoutStore';
import { CHROME_STRIP_CLASS, hasWindowChrome } from './WindowChrome';

interface SidebarProps {
  side: 'left' | 'right';
  children: ReactNode;
  /** Fired once when a resize drag ends (not per-frame) — the caller
   *  persists it; the live width during drag is just a CSS var, no state. */
  onResizeEnd: (widthPx: number) => void;
}

// Even 8px inset on both sides (top is set separately — it clears the window
// chrome on macOS).
const PANEL_PADDING_CLASSES = 'px-2 pb-2';

/** Shared shell for the left and right panels: a grey column holding
 *  `SidebarPacket` cards. No border — the grey-vs-black tone step against
 *  the main content is the divider.
 *
 *  Width is a CSS var (`--width-sidebar-left`/`-right`, tokens.css), not a
 *  fixed Tailwind class — `ResizeHandle` mutates it live during a drag with
 *  no state lifted anywhere.
 *
 *  Where the window has no header (macOS overlay title bar, see
 *  `WindowChrome.tsx`) the panel runs to the top edge and reserves a blank
 *  strip there for the traffic lights and floating toggles; that strip is
 *  also a window-drag region.
 *
 *  `overflow-x-hidden` is required, not cosmetic: `ResizeHandle` sits a
 *  couple px past this box's own edge (see its comment), and `overflow-y:
 *  auto` alone would compute `overflow-x` to `auto` too, making the panel
 *  horizontally scrollable.
 *
 *  The panel stays mounted when hidden and slides via its wrapper's width,
 *  while the aside inside keeps its full width so content is clipped, not
 *  reflowed. Overflow is only clipped while animating or closed — otherwise
 *  it would cut off the outer half of the resize handle that straddles the
 *  edge. `visibility` flips after the close finishes so a hidden panel can't
 *  be tabbed into. */
export function Sidebar({ side, children, onResizeEnd }: SidebarProps) {
  const isOpen = usePanelLayoutStore((state) => (side === 'left' ? state.isLeftSidebarOpen : state.isRightSidebarOpen));
  const isToggling = usePanelLayoutStore((state) => state.isToggling);
  const cssVar = side === 'left' ? '--width-sidebar-left' : '--width-sidebar-right';
  const isClipping = isToggling || !isOpen;
  // Only the left panel needs the reserved top strip (traffic lights + its
  // toggle). The right panel's toggle lives in its own icon bar, and the
  // floating one only appears once the panel is hidden.
  const hasChrome = hasWindowChrome() && side === 'left';

  return (
    <div
      aria-hidden={!isOpen}
      className="relative shrink-0"
      style={{
        width: isOpen ? `var(${cssVar})` : '0px',
        overflow: isClipping ? 'hidden' : 'visible',
        visibility: isOpen ? 'visible' : 'hidden',
        transition: isToggling
          ? `width ${SIDEBAR_TOGGLE_MS}ms ${SIDEBAR_TOGGLE_EASING}, visibility 0s linear ${
              isOpen ? '0ms' : `${SIDEBAR_TOGGLE_MS}ms`
            }`
          : 'none',
      }}
    >
      {hasChrome && <div data-tauri-drag-region className={`absolute inset-x-0 top-0 z-10 ${CHROME_STRIP_CLASS}`} />}
      <aside
        style={{ width: `var(${cssVar})` }}
        className={`relative flex h-full shrink-0 flex-col gap-2 overflow-y-auto overflow-x-hidden bg-bg-panel ${
          hasChrome ? 'pt-9' : 'pt-2'
        } ${PANEL_PADDING_CLASSES}`}
      >
        {children}
        <ResizeHandle side={side} cssVar={cssVar} onResizeEnd={onResizeEnd} />
      </aside>
    </div>
  );
}
