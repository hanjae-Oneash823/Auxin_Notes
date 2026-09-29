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

/** A section inside a sidebar — the unit the left/right panels are
 *  organised into. Square and the same tone as the panel (see the
 *  `--color-packet-bg`/`--radius-panel` tokens); only tab cards are lifted. */
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
      <div className={`flex flex-col px-1.5 pb-1.5 ${isFill ? 'min-h-0 flex-1' : ''} ${title || actions ? '' : 'pt-1.5'}`}>
        {children}
      </div>
    </section>
  );
}

interface PacketIconButtonProps {
  title: string;
  onClick: () => void;
  /** Dimmed and unclickable. */
  isDisabled?: boolean;
  /** Tints the icon with the PDF red (the sidebar's Imported PDFs colour). */
  isRed?: boolean;
  /** Any CSS color for the icon; dimmed at rest, full strength on hover. Wins over `isRed`. */
  color?: string;
  children: ReactNode;
}

/** Header icon button with the shared custom tooltip (see `useHoverTooltip`). */
export function PacketIconButton({ title, onClick, isDisabled = false, isRed = false, color, children }: PacketIconButtonProps) {
  const { hoverProps, hide, tooltip } = useHoverTooltip(title);

  return (
    <>
      <button
        type="button"
        aria-label={title}
        disabled={isDisabled}
        onClick={() => {
          hide();
          onClick();
        }}
        {...hoverProps}
        style={color ? { color } : undefined}
        className={`flex h-6 w-6 items-center justify-center rounded-row transition-[color,opacity,background-color] duration-panel ease-panel enabled:hover:bg-border-subtle disabled:cursor-default disabled:opacity-30 ${
          color ? 'opacity-80 enabled:hover:opacity-100' : isRed ? 'text-accent-link-broken' : 'text-fg-faint enabled:hover:text-fg-prominent'
        }`}
      >
        {children}
      </button>
      {tooltip}
    </>
  );
}
