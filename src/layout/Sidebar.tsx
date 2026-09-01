import type { ReactNode } from 'react';
import { ResizeHandle } from './ResizeHandle';

interface SidebarProps {
  side: 'left' | 'right';
  children: ReactNode;
  /** Fired once when a resize drag ends (not per-frame) — the caller
   *  persists it; the live width during drag is just a CSS var, no state. */
  onResizeEnd: (widthPx: number) => void;
}

/** Shared styling for both the left (vault nav) and right (inspector)
 *  panels — same width/scroll behavior, border on the side facing the main
 *  content. The left panel drops padding on that border-facing (right)
 *  side: its FolderTree child owns its own nested scroll container, and a
 *  parent's padding insets a nested child's box (and thus that child's
 *  scrollbar) away from the border — unlike a scrollbar on the panel's own
 *  box, which always renders flush to its border regardless of the panel's
 *  own padding. The right panel has no such nested scroller, so it keeps
 *  uniform padding.
 *
 *  Width is a CSS var (`--width-sidebar-left`/`-right`, tokens.css), not a
 *  fixed Tailwind class — `ResizeHandle` mutates it live during a drag, and
 *  `TitleBar.tsx`'s macOS label block reads the left one too, so they stay
 *  aligned through a resize with no state lifted between them.
 *
 *  `overflow-x-hidden` is required, not cosmetic: `ResizeHandle` deliberately
 *  sits a couple px past this box's own edge to center on the border (see
 *  its own comment), and per the CSS overflow spec `overflow-y: auto` alone
 *  computes `overflow-x` to `auto` too — without this, that stray overflow
 *  would make the whole panel horizontally scrollable. */
export function Sidebar({ side, children, onResizeEnd }: SidebarProps) {
  const cssVar = side === 'left' ? '--width-sidebar-left' : '--width-sidebar-right';

  return (
    <aside
      style={{ width: `var(${cssVar})` }}
      className={`relative flex shrink-0 flex-col gap-3 overflow-y-auto overflow-x-hidden py-3 pl-3 ${
        side === 'left' ? 'border-r-[1.5px] border-r-border-strong' : 'pr-3 border-l-[1.5px] border-l-border-strong'
      }`}
    >
      {children}
      <ResizeHandle side={side} cssVar={cssVar} onResizeEnd={onResizeEnd} />
    </aside>
  );
}
