import { useState } from 'react';
import { BookOpen, Orbit, PenLine } from 'lucide-react';
import { SettingsPanel } from '../app/settings/SettingsPanel';

interface StatusBarProps {
  vaultRoot: string;
  noteCount: number;
  unresolvedCount: number;
  isReadingMode: boolean;
  onToggleReadingMode: () => void;
  isGraphMode: boolean;
  onToggleGraphMode: () => void;
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
  isGraphMode,
  onToggleGraphMode,
}: StatusBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <footer
      className="relative flex shrink-0 items-center gap-4 border-t border-border px-3 py-1 text-fg-faint"
      style={{ fontSize: '0.7rem' }}
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
        onClick={onToggleGraphMode}
        title={isGraphMode ? 'graph view — click to return to the editor' : 'click to open the 3D graph view'}
        className={`ml-auto flex items-center transition-colors duration-panel ease-panel hover:text-fg-prominent ${
          isGraphMode ? 'text-fg-prominent' : 'text-fg-faint'
        }`}
      >
        <Orbit size={13} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={onToggleReadingMode}
        title={isReadingMode ? 'reading mode — click to switch to writing' : 'writing mode — click to switch to reading'}
        className="flex items-center text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
      >
        {isReadingMode ? <BookOpen size={13} strokeWidth={1.75} /> : <PenLine size={13} strokeWidth={1.75} />}
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
