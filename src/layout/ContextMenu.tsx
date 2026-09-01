import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  /** Colors the item as a destructive action (delete, etc). */
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * Minimal fixed-position right-click menu matching the app's own floating
 * chrome (the disambiguation/preview cards in linkChipWidget.ts) rather than
 * a native OS menu, which can't be restyled to fit the hairline-border,
 * no-radius look used everywhere else. Closes on any outside click or
 * Escape, and nudges itself back on-screen if it would render past the
 * viewport edge.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0) menu.style.left = `${Math.max(0, x - overflowX)}px`;
    if (overflowY > 0) menu.style.top = `${Math.max(0, y - overflowY)}px`;
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] border border-border bg-bg py-1"
      style={{ left: x, top: y, fontFamily: 'var(--font-family)', fontSize: '0.8rem' }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className={`block w-full px-3 py-1.5 text-left transition-colors duration-panel ease-panel hover:bg-border-subtle ${
            item.danger ? 'text-accent-link-broken' : 'text-fg-muted hover:text-fg-prominent'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
