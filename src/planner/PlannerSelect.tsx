import { useEffect, useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { FIELD_CLASS } from './plannerStyles';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectGroup {
  /** Small heading above the options; omit for an unlabeled group. */
  label?: string;
  options: readonly SelectOption[];
}

interface PlannerSelectProps {
  value: string;
  onChange: (value: string) => void;
  groups: readonly SelectGroup[];
  ariaLabel: string;
  className?: string;
  /** A shorter trigger, for toolbars: 28px tall instead of the form-field height. */
  isCompact?: boolean;
}

/** A dropdown that looks like the rest of the app (the native `<select>` popup is drawn by the OS): a field-styled button over a list like the `@` picker's. */
export function PlannerSelect({ value, onChange, groups, ariaLabel, className = '', isCompact = false }: PlannerSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = groups.flatMap((group) => group.options).find((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setIsOpen(false);
    };
    window.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape, true);
    return () => {
      window.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`${FIELD_CLASS} flex items-center justify-between gap-2 text-left ${isCompact ? '!py-0 h-7' : ''}`}
      >
        <span className="min-w-0 truncate">{selected?.label ?? ''}</span>
        <CaretDown size={12} className="shrink-0 text-fg-faint" />
      </button>

      {isOpen && (
        <div role="listbox" aria-label={ariaLabel} className="absolute left-0 top-full z-20 mt-1 max-h-56 min-w-full overflow-y-auto border border-border bg-bg py-1">
          {groups.map((group, groupIndex) => (
            <div key={group.label ?? groupIndex}>
              {group.label && <div className="px-3 pb-0.5 pt-1.5 text-fg-faint" style={{ fontSize: '0.7rem' }}>{group.label}</div>}
              {group.options.map((option) => (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`cursor-pointer whitespace-nowrap px-3 py-1.5 hover:bg-border-subtle hover:text-fg-prominent ${option.value === value ? 'text-fg-prominent' : 'text-fg-muted'}`}
                >
                  {option.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
