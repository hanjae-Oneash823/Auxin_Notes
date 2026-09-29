import type { ReactNode, Ref } from 'react';

interface ToolbarShellProps {
  /** Omit for a bare box (a lone control needs no heading). */
  label?: string;
  /** For toolbars that anchor a popover to their own edge. */
  barRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/** The floating strip every canvas toolbar shares: two lines, an uppercase
 *  label on top, both centered, and the icon buttons beneath it. Positioning is the parent's job (the toolbars sit side
 *  by side in one row) — and must not use a `transform` to center, which
 *  would make the hover tooltips' `position: fixed` resolve against the bar. */
export function ToolbarShell({ label, barRef, children }: ToolbarShellProps) {
  return (
    <div
      ref={barRef}
      className="pointer-events-auto flex flex-col justify-center gap-1 rounded-tab border bg-bg-packet-card px-2 py-1"
      style={{ borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-float)' }}
      // Keeps a click here from starting the board's marquee/pan.
      onPointerDown={(event) => event.stopPropagation()}
    >
      {label && (
        // The divider: a hairline under the name, spanning the box's full inner width.
        <span
          className="border-b pb-1 text-center text-fg-prominent tracking-label uppercase"
          style={{ fontSize: '0.72rem', lineHeight: 1.2, borderColor: 'var(--border-default)' }}
        >
          {label}
        </span>
      )}
      <div className="flex items-center justify-center gap-1">{children}</div>
    </div>
  );
}

/** A short vertical hairline separating groups of buttons within a toolbar. */
export function ToolbarDivider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px shrink-0" style={{ backgroundColor: 'var(--border-strong)' }} />;
}
