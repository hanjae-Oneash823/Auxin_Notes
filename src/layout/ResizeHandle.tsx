import type { MouseEvent as ReactMouseEvent } from 'react';

const MIN_WIDTH_PX = 200;
const MAX_WIDTH_PX = 480;

interface ResizeHandleProps {
  /** Which panel edge this sits on — determines drag-direction sign: a
   *  left-side panel grows as the pointer moves right, a right-side panel
   *  grows as it moves left. */
  side: 'left' | 'right';
  cssVar: '--width-sidebar-left' | '--width-sidebar-right';
  onResizeEnd: (widthPx: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const BORDER_WIDTH_PX = 1.5; // matches Sidebar.tsx's border-r/l-[1.5px]
const HANDLE_WIDTH_PX = 6; // Tailwind's w-1.5
// The handle is an absolutely-positioned child of the bordered <aside> — its
// containing block is that element's *padding* box, which sits entirely
// inside the border (border is outside padding, per the CSS box model), not
// flush with the border's visible outer edge. So `right: 0` alone lands at
// the border's inner edge, not its center. This offset pushes the handle
// outward by half its own width plus half the border's width, landing it
// exactly centered on the visible border line.
const CENTER_OFFSET_PX = (HANDLE_WIDTH_PX + BORDER_WIDTH_PX) / 2;

/** Invisible drag strip straddling a panel's existing border, resizing it
 *  by writing straight to the CSS var the panel's width is bound to —
 *  mirrors FolderTree.tsx's `beginDrag` (window-level mousemove/mouseup,
 *  removed on release) and settingsStore.ts's `applyFont` (CSS var as the
 *  live source of truth, no React state/re-render per frame). Committing
 *  to persisted config only happens once, in `onResizeEnd`. */
export function ResizeHandle({ side, cssVar, onResizeEnd }: ResizeHandleProps) {
  function handleMouseDown(event: ReactMouseEvent) {
    if (event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVar));
    const root = document.documentElement.style;

    function handleMouseMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX;
      const next = clamp(startWidth + (side === 'left' ? delta : -delta), MIN_WIDTH_PX, MAX_WIDTH_PX);
      root.setProperty(cssVar, `${next}px`);
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      const finalWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVar));
      onResizeEnd(finalWidth);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{ [side === 'left' ? 'right' : 'left']: `-${CENTER_OFFSET_PX}px` }}
      className="group absolute inset-y-0 z-10 flex w-1.5 cursor-col-resize justify-center"
    >
      <div className="h-full w-px bg-accent-link opacity-0 transition-opacity duration-panel ease-panel group-hover:opacity-100" />
    </div>
  );
}
