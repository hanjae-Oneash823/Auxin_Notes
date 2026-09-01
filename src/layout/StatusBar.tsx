import { useState } from 'react';
import { BookOpen, PencilLine } from '@phosphor-icons/react';
import { SettingsPanel } from '../app/settings/SettingsPanel';

interface StatusBarProps {
  vaultRoot: string;
  noteCount: number;
  unresolvedCount: number;
  isReadingMode: boolean;
  onToggleReadingMode: () => void;
}

/** Terminal-prompt-style status line pinned to the bottom of the window —
 *  bracketed segments matching the `[label]` convention used throughout the
 *  sidebar panels. */
export function StatusBar({
  vaultRoot,
  noteCount,
  unresolvedCount,
  isReadingMode,
  onToggleReadingMode,
}: StatusBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <footer
      className="relative flex shrink-0 items-center gap-4 border-t-[1.5px] border-t-border-strong px-3 py-2 text-fg-faint"
      style={{ fontSize: '0.9rem' }}
    >
      <span className="truncate">[vault: {vaultRoot}]</span>
      <span>
        [{noteCount} {noteCount === 1 ? 'note' : 'notes'}]
      </span>
      {unresolvedCount > 0 && (
        <span className="text-accent-link-broken">
          [{unresolvedCount} unresolved {unresolvedCount === 1 ? 'link' : 'links'}]
        </span>
      )}
      <button
        type="button"
        onClick={onToggleReadingMode}
        title={isReadingMode ? 'reading mode — click to switch to writing' : 'writing mode — click to switch to reading'}
        className="ml-auto flex items-center text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
      >
        {isReadingMode ? <BookOpen size={17} weight="regular" /> : <PencilLine size={17} weight="regular" />}
      </button>
      <button
        type="button"
        onClick={() => setSettingsOpen((open) => !open)}
        className="text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
      >
        [settings]
      </button>
      {settingsOpen && (
        <div className="absolute bottom-full right-3 z-10 mb-1">
          <SettingsPanel />
        </div>
      )}
    </footer>
  );
}
