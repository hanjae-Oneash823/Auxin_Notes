import { useEffect, useRef, useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { TRASH_COLOR_CLASS } from '../vault/trash';
import { CountBadge } from './CountBadge';

interface TrashFooterButtonProps {
  /** Items currently in the bin. */
  trashCount: number;
  /** Opens the right panel's file browser on the bin. */
  onOpenTrash: () => void;
  /** Asks to empty the bin (the app confirms before deleting). */
  onEmptyTrash: () => void;
}

const ROW_CLASS = 'block w-full px-3 py-1.5 text-left transition-colors duration-panel ease-panel enabled:hover:bg-border-subtle disabled:opacity-40';

/** Footer trash icon with its item count; clicking it opens a small popup just above
 *  with "open" and "empty trash". */
export function TrashFooterButton({ trashCount, onOpenTrash, onEmptyTrash }: TrashFooterButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && setIsOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const pick = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return (
    <span ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        title="trash"
        aria-label="trash"
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 transition-opacity duration-panel ease-panel opacity-80 hover:opacity-100"
      >
        <Trash size={17} className={TRASH_COLOR_CLASS} />
        <CountBadge count={trashCount} size="sm" tone="orange" />
      </button>
      {isOpen && (
        <div role="menu" className="absolute bottom-full left-1/2 z-10 mb-2 w-40 -translate-x-1/2 border border-border bg-bg py-1 text-fg-muted" style={{ fontSize: '0.8rem' }}>
          <div className="px-3 pb-1 text-fg-faint" style={{ fontSize: '0.7rem' }}>
            {trashCount} {trashCount === 1 ? 'item' : 'items'} in trash
          </div>
          <button type="button" role="menuitem" onClick={() => pick(onOpenTrash)} className={`${ROW_CLASS} hover:text-fg-prominent`}>
            open in browser
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={trashCount === 0}
            onClick={() => pick(onEmptyTrash)}
            className={`${ROW_CLASS} text-accent-link-broken`}
          >
            empty trash
          </button>
        </div>
      )}
    </span>
  );
}
