import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Channel, invoke } from '@tauri-apps/api/core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export const DEFAULT_PANEL_WIDTH = 640;
export const DEFAULT_PANEL_HEIGHT = 360;
export const MIN_PANEL_WIDTH = 320;
export const MIN_PANEL_HEIGHT = 200;
export const FONT_SIZE_OPTIONS = [11, 12, 13] as const;
export const DEFAULT_FONT_SIZE: (typeof FONT_SIZE_OPTIONS)[number] = 11;
const PANEL_GAP = 12;
const VIEWPORT_MARGIN = 8;

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  vaultRoot?: string;
  buttonX: number;
  buttonY: number;
  buttonSize: number;
  width: number;
  height: number;
  onResize: (width: number, height: number) => void;
  onResizeEnd: (width: number, height: number) => void;
  fontSize: number;
  onFontSizeChange: (fontSize: number) => void;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Which edges the panel opens away from the button on — upward from a
 *  button near the bottom of the screen, downward from one near the top,
 *  mirrored left/right the same way. `opensLeft`/`opensUp` each mean the
 *  *far* edge (right/bottom respectively) is the one pinned near the
 *  button; the near edge is the one that's free to move. The resize handle
 *  below needs this same answer to know which corner is actually free to
 *  drag — a handle on a pinned corner would fight the anchor instead of
 *  resizing anything. */
function anchorSides(buttonX: number, buttonY: number, buttonSize: number): { opensLeft: boolean; opensUp: boolean } {
  return {
    opensLeft: buttonX + buttonSize / 2 > window.innerWidth / 2,
    opensUp: buttonY + buttonSize / 2 > window.innerHeight / 2,
  };
}

/** Clamps to the viewport so a button dragged into a corner never pushes
 *  the panel off-screen. */
function anchorPosition(
  opensLeft: boolean,
  opensUp: boolean,
  buttonX: number,
  buttonY: number,
  buttonSize: number,
  panelWidth: number,
  panelHeight: number,
): { left: number; top: number } {
  const left = opensLeft ? buttonX + buttonSize - panelWidth : buttonX;
  const top = opensUp ? buttonY - PANEL_GAP - panelHeight : buttonY + buttonSize + PANEL_GAP;

  const maxLeft = Math.max(window.innerWidth - panelWidth - VIEWPORT_MARGIN, VIEWPORT_MARGIN);
  const maxTop = Math.max(window.innerHeight - panelHeight - VIEWPORT_MARGIN, VIEWPORT_MARGIN);
  return { left: clamp(left, VIEWPORT_MARGIN, maxLeft), top: clamp(top, VIEWPORT_MARGIN, maxTop) };
}

/** Mounted once, the first time the panel opens, and never unmounted after
 *  (see `TerminalLauncher`) — closing just toggles `visibility` rather than
 *  `display`, so the container keeps a real size for `FitAddon` while
 *  hidden. That keeps the xterm.js instance and its on-screen scrollback
 *  alive across close/reopen, matching the shell process itself staying
 *  alive on the Rust side (`terminal_spawn` reuses an existing session). */
export function TerminalPanel({
  isOpen,
  onClose,
  vaultRoot,
  buttonX,
  buttonY,
  buttonSize,
  width,
  height,
  onResize,
  onResizeEnd,
  fontSize,
  onFontSizeChange,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      convertEol: true,
      // A literal name, not `var(--font-family-mono)` — xterm measures
      // glyphs via a canvas context, which can't resolve CSS custom
      // properties the way DOM styles can.
      fontFamily: '"Cascadia Code", "JetBrains Mono", ui-monospace, monospace',
      // Only the size at first mount — later changes go through the
      // `[fontSize]` effect below, which updates the live instance instead
      // of remounting it (remounting would drop scrollback and reconnect
      // the pty session's channel for no reason).
      fontSize,
      // Explicit, not just relying on xterm's own defaults matching these —
      // block/quadrant characters (used by e.g. the Claude Code CLI's
      // splash logo) only tile into a clean image when every cell is
      // exactly the glyph's advance width/height with zero gap; any
      // line-height or letter-spacing padding shows up as visible seams
      // between what's meant to read as one continuous pixel-art image.
      lineHeight: 1,
      letterSpacing: 0,
      cursorBlink: true,
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#5fd0ff',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(255, 255, 255, 0.25)',
      },
    });
    termRef.current = term;
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    const channel = new Channel<string>((chunk) => {
      term.write(base64ToBytes(chunk));
    });

    void invoke('terminal_spawn', {
      channel,
      cwd: vaultRoot ?? null,
      cols: term.cols,
      rows: term.rows,
    }).catch((error: unknown) => {
      term.write(`\r\n[failed to start terminal: ${String(error)}]\r\n`);
    });

    const dataDisposable = term.onData((data) => {
      void invoke('terminal_write', { data });
    });

    // Also fires when the panel itself is resized (the container is a flex
    // child that fills it), so dragging the corner handle below re-fits
    // xterm and re-syncs the pty's size for free.
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      void invoke('terminal_resize', { cols: term.cols, rows: term.rows });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      term.dispose();
    };
    // Spawns once for this panel's lifetime (mounted once, see above) —
    // a later vaultRoot change shouldn't respawn the shell out from under
    // the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;
    term.options.fontSize = fontSize;
    // A font-size change alters the pixel size of each cell, so the
    // col/row count that fits the (unchanged) pixel-sized panel changes too
    // — re-fit and tell the pty, same as an actual panel resize does.
    fitAddon.fit();
    void invoke('terminal_resize', { cols: term.cols, rows: term.rows });
  }, [fontSize]);

  const { opensLeft, opensUp } = anchorSides(buttonX, buttonY, buttonSize);

  /** Whichever corner is free (not pinned to the button by `anchorPosition`)
   *  — dragging away from the pinned edge grows the panel, so a free left
   *  edge inverts the horizontal delta's sign, and likewise for a free top
   *  edge vertically. */
  function handleResizeHandlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = width;
    const startHeight = height;
    const maxWidth = Math.max(window.innerWidth - VIEWPORT_MARGIN * 2, MIN_PANEL_WIDTH);
    const maxHeight = Math.max(window.innerHeight - VIEWPORT_MARGIN * 2, MIN_PANEL_HEIGHT);

    function nextSize(clientX: number, clientY: number): { width: number; height: number } {
      const dx = clientX - startX;
      const dy = clientY - startY;
      const width = clamp(startWidth + (opensLeft ? -dx : dx), MIN_PANEL_WIDTH, maxWidth);
      const height = clamp(startHeight + (opensUp ? -dy : dy), MIN_PANEL_HEIGHT, maxHeight);
      return { width, height };
    }

    function handleMove(moveEvent: PointerEvent) {
      const next = nextSize(moveEvent.clientX, moveEvent.clientY);
      onResize(next.width, next.height);
    }

    function handleUp(upEvent: PointerEvent) {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      const next = nextSize(upEvent.clientX, upEvent.clientY);
      onResizeEnd(next.width, next.height);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  const { left, top } = anchorPosition(opensLeft, opensUp, buttonX, buttonY, buttonSize, width, height);

  return (
    <div
      className="fixed z-40 flex flex-col border border-border-strong bg-bg"
      style={{
        left,
        top,
        width,
        height,
        visibility: isOpen ? 'visible' : 'hidden',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.6)',
      }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
        <span className="text-fg-faint tracking-menu uppercase" style={{ fontSize: '0.68rem' }}>
          [terminal]
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {FONT_SIZE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                title={`${option}pt`}
                onClick={() => onFontSizeChange(option)}
                className={`transition-colors duration-panel ease-panel ${
                  option === fontSize ? 'text-fg-prominent' : 'text-fg-faint hover:text-fg-muted'
                }`}
                style={{ fontSize: '0.68rem' }}
              >
                [{option}]
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
            style={{ fontSize: '0.72rem' }}
          >
            [x]
          </button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden p-1" />
      <div
        onPointerDown={handleResizeHandlePointerDown}
        className={`group absolute flex h-4 w-4 p-0.5 ${opensLeft ? 'left-0 justify-start' : 'right-0 justify-end'} ${
          opensUp ? 'top-0 items-start' : 'bottom-0 items-end'
        } ${opensLeft === opensUp ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}`}
        style={{ touchAction: 'none' }}
      >
        <div className="h-2.5 w-2.5 border border-black bg-white opacity-0 transition-opacity duration-panel ease-panel group-hover:opacity-100" />
      </div>
    </div>
  );
}
