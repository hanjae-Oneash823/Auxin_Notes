import { useState } from 'react';
import { Broom } from '@phosphor-icons/react';
import { useHoverTooltip } from './HoverTooltip';

interface CloseAllTabsButtonProps {
  isDisabled: boolean;
  onConfirm: () => void;
}

/** Header button for the Tabs packet. Two-step: the first click swaps the
 *  icon for an inline "u sure?", the second click closes everything.
 *  Moving the pointer away disarms it. */
export function CloseAllTabsButton({ isDisabled, onConfirm }: CloseAllTabsButtonProps) {
  const [isArmed, setIsArmed] = useState(false);
  const { hoverProps, hide, tooltip } = useHoverTooltip('close all tabs');

  return (
    <>
      <button
        type="button"
        aria-label="close all tabs"
        disabled={isDisabled}
        onClick={() => {
          hide();
          if (!isArmed) {
            setIsArmed(true);
            return;
          }
          setIsArmed(false);
          onConfirm();
        }}
        {...hoverProps}
        onMouseLeave={() => {
          setIsArmed(false);
          hoverProps.onMouseLeave?.();
        }}
        className={`flex h-6 items-center justify-center rounded-row text-fg-faint transition-colors duration-panel ease-panel disabled:cursor-default disabled:opacity-30 enabled:hover:text-accent-link-broken ${
          isArmed ? 'px-1.5 text-accent-link-broken' : 'w-6'
        }`}
        style={{ fontSize: '0.75rem' }}
      >
        {isArmed ? 'u sure?' : <Broom size={15} />}
      </button>
      {tooltip}
    </>
  );
}
