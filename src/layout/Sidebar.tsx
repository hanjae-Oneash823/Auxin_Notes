import type { ReactNode } from 'react';
import { ResizeHandle } from './ResizeHandle';
import { SIDEBAR_TOGGLE_EASING, SIDEBAR_TOGGLE_MS, useSidebarVisibilityStore } from './sidebarVisibilityStore';

interface SidebarProps {
  side: 'left' | 'right';
  children: ReactNode;
  /** Fired once when a resize drag ends (not per-frame) — the caller
   *  persists it; the live width during drag is just a CSS var, no state. */
  onResizeEnd: (widthPx: number) => void;
}

/** Shared shell for the left (vault nav) and right (inspector) panels: a
 *  grey column holding `SidebarPacket` cards. No border — the grey-vs-black
 *  tone step against the main content is the divider.
 *
 *  Width is a CSS var (`--width-sidebar-left`/`-right`, tokens.css), not a
 *  fixed Tailwind class — `ResizeHandle` mutates it live during a drag, and
 *  `TitleBar.tsx`'s label block reads the left one too, so they stay aligned
 *  through a resize with no state lifted between them.
 *
 *  `overflow-x-hidden` is required, not cosmetic: `ResizeHandle` sits a
 *  couple px past this box's own edge (see its comment), and `overflow-y:
 *  auto` alone would compute `overflow-x` to `auto` too, making the panel
 *  horizontally scrollable. */
export function Sidebar({ side, children, onResizeEnd }: SidebarProps) {
  const isLeftSidebarOpen = useSidebarVisibilityStore((state) => state.isLeftSidebarOpen);
  const isToggling = useSidebarVisibilityStore((state) => state.isToggling);

  const cssVar = side === 'left' ? '--width-sidebar-left' : '--width-sidebar-right';

  // Left panel: no right padding, so the fill packet's nested scrollbar (the
  // file tree) lands flush on the sidebar's outer edge. The other packets
  // re-add that 8px as a margin to stay inset; the fill packet (`flex-1`)
  // runs edge-to-edge with a square right side.
  const sideClasses =
    side === 'left' ? 'py-2 pl-2 [&>section]:mr-2 [&>section.flex-1]:mr-0 [&>section.flex-1]:rounded-r-none' : 'p-2';

  const panel = (
    <aside
      style={{ width: `var(${cssVar})` }}
      className={`relative flex shrink-0 flex-col gap-2 overflow-y-auto overflow-x-hidden bg-bg-panel ${sideClasses}`}
    >
      {children}
      <ResizeHandle side={side} cssVar={cssVar} onResizeEnd={onResizeEnd} />
    </aside>
  );

  if (side === 'right') return panel;

  // Left panel: stays mounted and slides via its wrapper's width, while the
  // aside inside keeps its full width so content is clipped, not reflowed.
  // Overflow is only clipped while animating or closed — otherwise it would
  // cut off the outer half of the resize handle that straddles the edge.
  // `visibility` flips after the close finishes so a hidden panel can't be
  // tabbed into.
  const isClipping = isToggling || !isLeftSidebarOpen;
  return (
    <div
      aria-hidden={!isLeftSidebarOpen}
      className="shrink-0"
      style={{
        width: isLeftSidebarOpen ? `var(${cssVar})` : '0px',
        overflow: isClipping ? 'hidden' : 'visible',
        visibility: isLeftSidebarOpen ? 'visible' : 'hidden',
        transition: isToggling
          ? `width ${SIDEBAR_TOGGLE_MS}ms ${SIDEBAR_TOGGLE_EASING}, visibility 0s linear ${
              isLeftSidebarOpen ? '0ms' : `${SIDEBAR_TOGGLE_MS}ms`
            }`
          : 'none',
      }}
    >
      {panel}
    </div>
  );
}
