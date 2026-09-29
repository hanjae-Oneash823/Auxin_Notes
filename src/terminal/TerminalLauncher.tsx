import { useEffect, useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '../layout/ContextMenu';
import { TerminalButton, TERMINAL_BUTTON_SIZE } from './TerminalButton';
import { PresetIcon } from './TerminalPresetBar';
import { agentMenuItem } from './terminalAgent';
import type { AgentTarget } from './terminalAgentPrompt';
import { getTerminalStatus, launchTerminalCommand, stopTerminalProcess } from './terminalLaunch';
import { isRiskyCommand, useTerminalPresets } from './terminalPresets';

const POSITION_STORAGE_KEY = 'auxin.terminalButtonPos';
const DEFAULT_MARGIN = 24;
const MENU_NAME_MAX_CHARS = 24;

function truncateName(name: string): string {
  return name.length > MENU_NAME_MAX_CHARS ? `${name.slice(0, MENU_NAME_MAX_CHARS - 1)}…` : name;
}

interface Position {
  x: number;
  y: number;
}

function defaultPosition(): Position {
  return {
    x: window.innerWidth - TERMINAL_BUTTON_SIZE - DEFAULT_MARGIN,
    y: window.innerHeight - TERMINAL_BUTTON_SIZE - DEFAULT_MARGIN,
  };
}

function clampPositionToViewport(position: Position): Position {
  const maxX = Math.max(window.innerWidth - TERMINAL_BUTTON_SIZE, 0);
  const maxY = Math.max(window.innerHeight - TERMINAL_BUTTON_SIZE, 0);
  return { x: Math.min(Math.max(position.x, 0), maxX), y: Math.min(Math.max(position.y, 0), maxY) };
}

function loadPosition(): Position {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return defaultPosition();
    const parsed = JSON.parse(raw) as Partial<Position>;
    const { x, y } = parsed;
    if (typeof x !== 'number' || typeof y !== 'number') return defaultPosition();
    return clampPositionToViewport({ x, y });
  } catch {
    return defaultPosition();
  }
}

function savePosition(position: Position): void {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Private-browsing-style storage restrictions aren't expected in a
    // desktop Tauri webview, but losing this persistence isn't worth
    // surfacing an error over either way.
  }
}

/** The floating terminal button. The terminal itself lives in the right panel
 *  (see `TerminalPane`); clicking this opens a menu of the same presets,
 *  which show the terminal layer and run the chosen command. It remembers
 *  where it was dragged (mirrored to `localStorage` so it survives a restart). */
export function TerminalLauncher({ focusedTarget }: { focusedTarget: AgentTarget | null }) {
  const [position, setPosition] = useState<Position>(() => loadPosition());
  const presets = useTerminalPresets((state) => state.presets);
  const [menuItems, setMenuItems] = useState<ContextMenuItem[] | null>(null);

  /** Status is read fresh on each click, so the menu can grey out a busy terminal. */
  async function openMenu() {
    const status = await getTerminalStatus().catch(() => 'none' as const);
    const isBusy = status === 'busy';
    const askLabel = focusedTarget ? `ask about "${truncateName(focusedTarget.name)}"` : null;
    setMenuItems([
      ...(isBusy
        ? [
            { label: 'terminal is busy', disabled: true, isPulsing: true },
            {
              label: 'stop terminal process',
              isRisky: true,
              onSelect: () =>
                void stopTerminalProcess().catch((error: unknown) => console.error('[terminal] stop failed', error)),
            },
          ]
        : []),
      ...presets.map((preset) => ({
        label: preset.label,
        icon: <PresetIcon command={preset.command} />,
        disabled: isBusy,
        isRisky: isRiskyCommand(preset.command),
        onSelect: () => void launchTerminalCommand(preset.command),
      })),
      // Busy: the label promises the stop, so no extra confirm is needed.
      ...(focusedTarget && askLabel
        ? [agentMenuItem(focusedTarget, isBusy ? `stop & ${askLabel}` : askLabel, isBusy)]
        : []),
    ]);
  }

  useEffect(() => {
    function handleResize() {
      setPosition((current) => clampPositionToViewport(current));
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      <TerminalButton
        x={position.x}
        y={position.y}
        isOpen={menuItems !== null}
        onMove={(x, y) => setPosition({ x, y })}
        onMoveEnd={(x, y) => savePosition({ x, y })}
        onToggle={() => void openMenu()}
      />
      {menuItems && <ContextMenu x={position.x} y={position.y} items={menuItems} onClose={() => setMenuItems(null)} />}
    </>
  );
}
