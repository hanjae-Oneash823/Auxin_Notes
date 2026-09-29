import { useState } from 'react';
import { SidebarPacket } from '../layout/SidebarPacket';
import { TerminalPanel } from './TerminalPanel';
import { TerminalPresetBar } from './TerminalPresetBar';
import { useTerminalStatus } from './terminalLaunch';
import { DEFAULT_FONT_SIZE, FONT_SIZE_OPTIONS } from './terminalPanelConstants';
import { DEFAULT_THEME_ID, TERMINAL_THEMES, isTerminalThemeId } from './terminalThemes';

const FONT_SIZE_STORAGE_KEY = 'auxin.terminalFontSize';
const THEME_STORAGE_KEY = 'auxin.terminalTheme';

function loadFontSize(): number {
  try {
    const raw = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    return (FONT_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

function saveFontSize(fontSize: number): void {
  try {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(fontSize));
  } catch {
    // Losing this persistence isn't worth surfacing an error over.
  }
}

function loadThemeId(): string {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isTerminalThemeId(raw) ? raw : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function saveThemeId(id: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Losing this persistence isn't worth surfacing an error over.
  }
}

interface TerminalPaneProps {
  vaultRoot?: string;
  /** The terminal layer is the one showing — status polling only runs then. */
  isActive: boolean;
}

/** The terminal as a right-panel layer: a sidebar packet with the font-size
 *  choice in its header and the xterm host filling the rest. The caller keeps
 *  this mounted (just hidden) while another layer is showing — see
 *  `TerminalPanel` for why it must never unmount. */
export function TerminalPane({ vaultRoot, isActive }: TerminalPaneProps) {
  const status = useTerminalStatus(isActive);
  const [fontSize, setFontSize] = useState<number>(() => loadFontSize());
  const [themeId, setThemeId] = useState<string>(() => loadThemeId());

  return (
    <SidebarPacket
      title="Terminal"
      isFill
      actions={
        <div className="flex items-center gap-2.5 pr-1">
          <div className="flex items-center gap-1.5">
            {TERMINAL_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                title={theme.label}
                aria-label={`${theme.label} theme`}
                onClick={() => {
                  setThemeId(theme.id);
                  saveThemeId(theme.id);
                }}
                className={`h-2.5 w-2.5 rounded-full transition-transform duration-panel ease-panel hover:scale-125 ${
                  theme.id === themeId ? 'outline outline-1 outline-offset-2 outline-fg-prominent' : ''
                }`}
                style={{ background: theme.swatch }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
          {FONT_SIZE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              title={`${option}pt`}
              onClick={() => {
                setFontSize(option);
                saveFontSize(option);
              }}
              className={`transition-colors duration-panel ease-panel ${
                option === fontSize ? 'text-fg-prominent' : 'text-fg-faint hover:text-fg-muted'
              }`}
              style={{ fontSize: '0.68rem' }}
            >
              [{option}]
            </button>
          ))}
          </div>
        </div>
      }
    >
      <TerminalPresetBar status={status} />
      <TerminalPanel vaultRoot={vaultRoot} fontSize={fontSize} themeId={themeId} />
    </SidebarPacket>
  );
}
