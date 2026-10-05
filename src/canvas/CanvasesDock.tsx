import { Stack } from '@phosphor-icons/react';
import type { NoteSummary } from '../db/queries/notes';
import { FileDock } from '../layout/FileDock';

interface CanvasesDockProps {
  canvases: NoteSummary[];
  /** Vault-relative path of the open tab, to highlight its card. */
  activePath: string | null;
  /** `source` is the clicked card, for the fly-to-tab animation. */
  onSelect: (path: string, source?: HTMLElement) => void;
}

/** Searchable list of every canvas in the vault. */
export function CanvasesDock({ canvases, activePath, onSelect }: CanvasesDockProps) {
  return (
    <FileDock
      files={canvases}
      activePath={activePath}
      onSelect={onSelect}
      icon={<Stack size={15} className="shrink-0 text-accent-link" />}
      searchPlaceholder="search canvases"
      emptyText="no canvases yet — make one with the button above."
      noMatchText="no matching canvases."
    />
  );
}
