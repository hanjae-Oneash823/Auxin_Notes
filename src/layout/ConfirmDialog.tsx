import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small centered confirmation card for irreversible actions (deleting a note
 * or folder) — matches the app's own floating-card chrome (see
 * `ContextMenu.tsx` and the disambiguation/preview cards in
 * `linkChipWidget.ts`) instead of the browser's native `window.confirm`,
 * which can't be restyled and looks out of place next to everything else.
 * Escape cancels; there's no outside-click dismissal since a destructive
 * confirmation should require a deliberate choice, not an accidental
 * stray click.
 */
export function ConfirmDialog({ message, confirmLabel = 'delete', onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="w-[280px] border border-border bg-bg p-3"
        style={{ fontFamily: 'var(--font-family)', fontSize: '0.8rem' }}
      >
        <p className="text-fg-prominent">{message}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-border px-2 py-1 text-fg-muted transition-colors duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent"
          >
            cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="border border-accent-link-broken px-2 py-1 text-accent-link-broken transition-colors duration-panel ease-panel hover:bg-accent-link-broken hover:text-black"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
