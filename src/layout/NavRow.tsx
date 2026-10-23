import type { ReactNode, Ref } from 'react';
import { CountBadge } from './CountBadge';
import { useHoverTooltip } from './HoverTooltip';

interface NavRowProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  /** A count shown in a small square at the tile's top-right corner. */
  count?: number;
  /** For tiles that anchor a popup to themselves. */
  buttonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

export function NavRow({ label, isActive, onClick, count, buttonRef, children }: NavRowProps) {
  const { hoverProps, hide, tooltip } = useHoverTooltip(label);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={buttonRef ? isActive : undefined}
        onClick={() => {
          hide();
          onClick();
        }}
        {...hoverProps}
        aria-label={label}
        className={`relative flex h-11 items-center justify-center overflow-hidden rounded-tab transition-colors duration-panel ease-panel hover:bg-bg-packet-active hover:text-fg-prominent ${
          isActive ? 'bg-bg-packet-active text-fg-prominent' : 'bg-border-subtle text-fg-muted'
        }`}
      >
        {children}
        {count !== undefined && <CountBadge count={count} size="sm" className="absolute right-0 top-0" />}
      </button>
      {tooltip}
    </>
  );
}
