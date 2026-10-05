interface ConfirmModalProps {
  title: string;
  body: string;
  confirmLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, body, confirmLabel = 'Confirm', isDanger = false, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onCancel}>
      <div
        role="alertdialog"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex w-[400px] max-w-[92vw] flex-col gap-3 rounded-tab border border-border bg-bg p-4"
        style={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem' }}
      >
        <h2 className={`font-semibold ${isDanger ? 'text-accent-link-broken' : 'text-fg-prominent'}`} style={{ fontSize: '0.95rem' }}>{title}</h2>
        <p className="text-fg-muted">{body}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="rounded-tab border border-border-subtle px-3 py-1.5 text-fg-muted transition-colors duration-panel ease-panel hover:text-fg-prominent">Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-tab border px-3 py-1.5 transition-colors duration-panel ease-panel hover:bg-border-subtle ${
              isDanger ? 'border-accent-link-broken text-accent-link-broken' : 'border-border-strong text-fg-prominent'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
