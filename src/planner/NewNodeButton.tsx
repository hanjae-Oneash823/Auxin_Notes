import { Plus } from '@phosphor-icons/react';

/** The "New node" button beside the quick-add bar, which opens the full node form. */
export function NewNodeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-tab border border-border-strong px-3 py-2 text-fg-muted transition-colors duration-panel ease-panel hover:border-fg-muted hover:text-fg-prominent"
    >
      <Plus size={14} />
      New node
    </button>
  );
}
