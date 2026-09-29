import { useEffect, useRef, useState } from 'react';
import { useHoverTooltip } from '../layout/HoverTooltip';
import { ARROW_COLOR_CHOICES } from './canvasConstants';

const DOT_PX = 16;
/** Delay between one swatch popping in and the next. */
const SWATCH_STAGGER_MS = 30;

interface ArrowColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

/** A small circle showing the board's arrow color; click for a row of
 *  alternatives. The popover is a plain absolutely-positioned sibling (no
 *  transform), so the hover tooltip's `position: fixed` still resolves against
 *  the window. */
export function ArrowColorPicker({ color, onChange }: ArrowColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { hoverProps, hide, tooltip } = useHoverTooltip('Arrow color');

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="pointer-events-auto relative flex h-6 w-6 items-center justify-center">
      <button
        type="button"
        aria-label="Arrow color"
        aria-expanded={isOpen}
        onClick={() => {
          hide();
          setIsOpen((open) => !open);
        }}
        {...hoverProps}
        // The color change fades rather than snapping.
        className="block rounded-full border transition-[transform,background-color] duration-300 ease-panel hover:scale-110 motion-reduce:transition-none"
        style={{ width: DOT_PX + 4, height: DOT_PX + 4, backgroundColor: color, borderColor: 'var(--border-strong)' }}
      />
      {tooltip}
      {/* Always mounted so it can animate out as well as in: the box rises and
          fades, then the swatches pop in one after another (and all at once on
          close). Closed, it takes no pointer events and no Tab stops. */}
      <div
        aria-hidden={!isOpen}
        className={`absolute bottom-full right-0 mb-2 flex origin-bottom-right items-center gap-1.5 rounded-tab border bg-bg-packet-card px-2 py-1.5 transition-[opacity,transform] duration-panel ease-panel motion-reduce:transition-none ${
          isOpen ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-1 scale-95 opacity-0'
        }`}
        style={{ borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-float)' }}
      >
        {ARROW_COLOR_CHOICES.map((choice, index) => {
          const isCurrent = choice.value === color;
          return (
            <button
              key={choice.value}
              type="button"
              tabIndex={isOpen ? 0 : -1}
              title={choice.name}
              aria-label={choice.name}
              aria-pressed={isCurrent}
              onClick={() => {
                onChange(choice.value);
                setIsOpen(false);
              }}
              className={`block rounded-full border transition-[opacity,transform,border-color] duration-panel ease-panel hover:scale-125 motion-reduce:transition-none ${
                isOpen ? 'opacity-100' : 'opacity-0'
              } ${isCurrent ? (isOpen ? 'scale-110' : 'scale-125') : isOpen ? 'scale-100' : 'scale-50'}`}
              style={{
                width: DOT_PX,
                height: DOT_PX,
                backgroundColor: choice.value,
                borderColor: isCurrent ? 'var(--fg-full)' : 'transparent',
                transitionDelay: isOpen ? `${index * SWATCH_STAGGER_MS}ms` : '0ms',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
