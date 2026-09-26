import type { ReactNode } from 'react';
import { ResizeHandle } from './ResizeHandle';
import { SIDEBAR_TOGGLE_EASING, SIDEBAR_TOGGLE_MS, usePanelLayoutStore } from './panelLayoutStore';

interface SidebarProps {
  side: 'left' | 'right';
  children: ReactNode;
  /** Fired once when a resize drag ends (not per-frame) — the caller
   *  persists it; the live width during drag is just a CSS var, no state. */
  onResizeEnd: (widthPx: number) => void;
}

// No padding on the right, so a fill packet's nested scrollbar (the file
// tree) — and the aside's own — lands flush on the panel's right edge. The
// other packets re-add that 8px as a margin to stay inset; the fill packet
// (`flex-1`) runs edge-to-edge with a square right side. Same for both
// panels: the right panel's right edge is the window edge, the left panel's
// is the divider against the content.
const PANEL_PADDING_CLASSES = 'py-2 pl-2 [&>section]:mr-2 [&>section.flex-1]:mr-0 [&>section.flex-1]:rounded-r-none';

/** Shared shell for the left and right panels: a grey column holding
 *  `SidebarPacket` cards. No border — the grey-vs-black tone step against
 *  the main content is the divider.
 *
 *  Width is a CSS var (`--width-sidebar-left`/`-right`, tokens.css), not a
 *  fixed Tailwind class — `ResizeHandle` mutates it live during a drag, and
 *  `TitleBar.tsx`'s label block reads the left one too, so they stay aligned
 *  through a resize with no state lifted between them.
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

  return (
    <div
      aria-hidden={!isOpen}
      className="shrink-0"
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
      <aside
        style={{ width: `var(${cssVar})` }}
        className={`relative flex h-full shrink-0 flex-col gap-2 overflow-y-auto overflow-x-hidden bg-bg-panel ${PANEL_PADDING_CLASSES}`}
      >
        {children}
        <ResizeHandle side={side} cssVar={cssVar} onResizeEnd={onResizeEnd} />
      </aside>
    </div>
  );
}
