import type { ReactNode } from 'react';

interface SidebarProps {
  side: 'left' | 'right';
  children: ReactNode;
}

/** Shared styling for both the left (vault nav) and right (inspector)
 *  panels — same width/padding/scroll behavior, border on the side facing
 *  the main content. */
export function Sidebar({ side, children }: SidebarProps) {
  return (
    <aside
      className={`flex w-64 shrink-0 flex-col gap-3 overflow-y-auto p-3 ${
        side === 'left' ? 'border-r border-border' : 'border-l border-border'
      }`}
    >
      {children}
    </aside>
  );
}
