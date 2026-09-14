import { useEffect, useState } from 'react';
import { TerminalButton, TERMINAL_BUTTON_SIZE } from './TerminalButton';
import { TerminalPanel } from './TerminalPanel';
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_PANEL_HEIGHT,
  DEFAULT_PANEL_WIDTH,
  FONT_SIZE_OPTIONS,
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
} from './terminalPanelConstants';

const POSITION_STORAGE_KEY = 'auxin.terminalButtonPos';
const SIZE_STORAGE_KEY = 'auxin.terminalPanelSize';
const FONT_SIZE_STORAGE_KEY = 'auxin.terminalFontSize';
const DEFAULT_MARGIN = 24;
const VIEWPORT_MARGIN = 8;

interface Position {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
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

function clampSizeToViewport(size: Size): Size {
  const maxWidth = Math.max(window.innerWidth - VIEWPORT_MARGIN * 2, MIN_PANEL_WIDTH);
  const maxHeight = Math.max(window.innerHeight - VIEWPORT_MARGIN * 2, MIN_PANEL_HEIGHT);
  return {
    width: Math.min(Math.max(size.width, MIN_PANEL_WIDTH), maxWidth),
    height: Math.min(Math.max(size.height, MIN_PANEL_HEIGHT), maxHeight),
  };
}

function loadSize(): Size {
  try {
    const raw = localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) return { width: DEFAULT_PANEL_WIDTH, height: DEFAULT_PANEL_HEIGHT };
    const parsed = JSON.parse(raw) as Partial<Size>;
    const { width, height } = parsed;
    if (typeof width !== 'number' || typeof height !== 'number') {
      return { width: DEFAULT_PANEL_WIDTH, height: DEFAULT_PANEL_HEIGHT };
    }
    return clampSizeToViewport({ width, height });
  } catch {
    return { width: DEFAULT_PANEL_WIDTH, height: DEFAULT_PANEL_HEIGHT };
  }
}

function saveSize(size: Size): void {
  try {
    localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // See savePosition — losing persistence isn't worth surfacing an error.
  }
}

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
    // See savePosition — losing persistence isn't worth surfacing an error.
  }
}

interface TerminalLauncherProps {
  vaultRoot?: string;
}

/** Floating terminal launcher: owns the button's dragged position and the
 *  panel's dragged size (both mirrored to `localStorage` so they survive a
 *  restart) and the panel's open state. The panel itself is only mounted
 *  after the first open and never unmounted again — see `TerminalPanel` for
 *  why — so this just flips `isOpen` on subsequent toggles instead of
 *  tearing anything down. */
export function TerminalLauncher({ vaultRoot }: TerminalLauncherProps) {
  const [position, setPosition] = useState<Position>(() => loadPosition());
  const [size, setSize] = useState<Size>(() => loadSize());
  const [fontSize, setFontSize] = useState<number>(() => loadFontSize());
  const [hasOpened, setHasOpened] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handleResize() {
      setPosition((current) => clampPositionToViewport(current));
      setSize((current) => clampSizeToViewport(current));
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function handleToggle() {
    setHasOpened(true);
    setIsOpen((open) => !open);
  }

  return (
    <>
      {hasOpened && (
        <TerminalPanel
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          vaultRoot={vaultRoot}
          buttonX={position.x}
          buttonY={position.y}
          buttonSize={TERMINAL_BUTTON_SIZE}
          width={size.width}
          height={size.height}
          onResize={(width, height) => setSize({ width, height })}
          onResizeEnd={(width, height) => saveSize({ width, height })}
          fontSize={fontSize}
          onFontSizeChange={(next) => {
            setFontSize(next);
            saveFontSize(next);
          }}
        />
      )}
      <TerminalButton
        x={position.x}
        y={position.y}
        isOpen={isOpen}
        onMove={(x, y) => setPosition({ x, y })}
        onMoveEnd={(x, y) => savePosition({ x, y })}
        onToggle={handleToggle}
      />
    </>
  );
}
