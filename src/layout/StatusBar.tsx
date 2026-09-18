import { useState } from 'react';
import { BookOpen, Moon, PencilLine, Sun } from '@phosphor-icons/react';
import { SettingsPanel } from '../app/settings/SettingsPanel';
import { useSettingsStore } from '../app/settings/settingsStore';

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
  const { themeId, setTheme } = useSettingsStore();
  const isLight = themeId === 'light';

  return (
    <footer
      className="relative flex shrink-0 items-center gap-4 border-t border-t-border-strong bg-bg-footer px-3 py-1.5 text-fg-footer"
      style={{ fontSize: 'var(--font-size-chrome)' }}
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
        className="ml-auto flex items-center text-fg-footer transition-colors duration-panel ease-panel hover:text-fg-footer-prominent"
      >
        {isReadingMode ? <BookOpen size={17} weight="regular" /> : <PencilLine size={17} weight="regular" />}
      </button>
      <button
        type="button"
        onClick={() => void setTheme(isLight ? 'dark' : 'light')}
        title={isLight ? 'light mode — click to switch to dark' : 'dark mode — click to switch to light'}
        className="flex items-center text-fg-footer transition-colors duration-panel ease-panel hover:text-fg-footer-prominent"
      >
        {isLight ? <Sun size={17} weight="regular" /> : <Moon size={17} weight="regular" />}
      </button>
      <button
        type="button"
        onClick={() => setSettingsOpen((open) => !open)}
        className="text-fg-footer transition-colors duration-panel ease-panel hover:text-fg-footer-prominent"
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
