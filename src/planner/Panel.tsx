import type { ReactNode } from 'react';
import { PANEL_BACKGROUND } from './plannerStyles';

interface PanelProps {
  title: string;
  /** Shown as `(n)` after the title, like the dashboard's pool panels. */
  count?: number;
  /** Title color; defaults to the prominent text color. */
  color?: string;
  /** Right-aligned header controls. */
  actions?: ReactNode;
  children: ReactNode;
}

/** The dashboard's pool-panel look: a flat card-colored panel with a bold title, a count and the rows underneath. */
export function Panel({ title, count, color, actions, children }: PanelProps) {
  return (
    <section className="flex flex-col gap-1.5 rounded-tab p-3" style={{ background: PANEL_BACKGROUND }}>
      <header className="flex items-center gap-2 px-1 pb-1.5">
        <h3 className={`font-semibold ${color ? '' : 'text-fg-prominent'}`} style={{ fontSize: '1.05rem', color }}>{title}</h3>
        {count !== undefined && <span className="text-fg-faint tabular-nums" style={{ fontSize: '0.8rem' }}>({count})</span>}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
