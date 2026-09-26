import type { ReactNode } from 'react';
import { useHoverTooltip } from './HoverTooltip';

interface SidebarPacketProps {
  /** Small heading shown in the packet's header row; omit for a bare card. */
  title?: string;
  /** Right-aligned header controls (icon buttons). */
  actions?: ReactNode;
  /** Let the packet grow to fill the sidebar's remaining height, giving its
   *  body a scroll container (used by the file tree). */
  isFill?: boolean;
  children: ReactNode;
}

/** A rounded card inside a sidebar — the unit the left/right panels are
 *  organised into. Sits one tone above the grey panel behind it. */
export function SidebarPacket({ title, actions, isFill = false, children }: SidebarPacketProps) {
  return (
    <section
      className={`flex flex-col rounded-panel bg-bg-packet ${isFill ? 'min-h-0 flex-1' : 'shrink-0'}`}
    >
      {(title || actions) && (
        <header className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-2.5">
          <span className="truncate text-fg-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>
            {title}
          </span>
          {actions && <div className="flex items-center gap-0.5">{actions}</div>}
        </header>
      )}
      {/* A fill packet hosts a scroll container (the file tree), so it drops
          right padding: a parent's padding would inset the nested
          scrollbar from the packet's edge instead of leaving it flush. */}
      <div
        className={`flex flex-col pb-1.5 pl-1.5 ${isFill ? 'min-h-0 flex-1 pr-0' : 'pr-1.5'} ${
          title || actions ? '' : 'pt-1.5'
        }`}
      >
        {children}
      </div>
    </section>
  );
}

interface PacketIconButtonProps {
  title: string;
  onClick: () => void;
  children: ReactNode;
}

/** Header icon button with the shared custom tooltip (see `useHoverTooltip`). */
export function PacketIconButton({ title, onClick, children }: PacketIconButtonProps) {
  const { hoverProps, hide, tooltip } = useHoverTooltip(title);

  return (
    <>
      <button
        type="button"
        aria-label={title}
        onClick={() => {
          hide();
          onClick();
        }}
        {...hoverProps}
        className="flex h-6 w-6 items-center justify-center rounded-row text-fg-faint transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent"
      >
        {children}
      </button>
      {tooltip}
    </>
  );
}
