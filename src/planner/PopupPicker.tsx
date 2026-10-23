import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PANEL_TRANSITION } from './plannerMotion';

interface PopupPickerProps {
  /** What the small trigger button shows. */
  trigger: ReactNode;
  /** Accessible name and tooltip of the trigger. */
  label: string;
  /** Which edge of the trigger the popup lines up with. */
  align?: 'left' | 'right';
  triggerClassName?: string;
  /** The popup's contents; call `close` once something is picked. */
  children: (close: () => void) => ReactNode;
}

/** A button that opens a floating panel under itself; a pick, a click outside or Escape closes it. */
export function PopupPicker({ trigger, label, align = 'right', triggerClassName = '', children }: PopupPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
    <div ref={rootRef} className="relative">
      <button type="button" aria-label={label} aria-expanded={isOpen} title={label} onClick={() => setIsOpen((open) => !open)} className={triggerClassName}>
        {trigger}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={PANEL_TRANSITION}
            className={`absolute top-full z-30 mt-2 w-max rounded-tab border border-border bg-bg p-2.5 ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'}`}
          >
            {children(() => setIsOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
