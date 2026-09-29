import type { ReactNode } from 'react';

interface PillProps {
  children: ReactNode;
}

/** Small outlined badge for a note's type or status ("hub", ...). Reserved
 *  for type/status — tags and counts stay plain text so pills don't turn
 *  into noise. */
export function Pill({ children }: PillProps) {
  return (
    <span
      className="shrink-0 rounded-row border px-1.5 leading-4 text-fg-muted"
      style={{ fontSize: '0.65rem', borderColor: 'var(--fg-faint)' }}
    >
      {children}
    </span>
  );
}
