import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Terminal as TerminalIcon } from '@phosphor-icons/react';

export const TERMINAL_BUTTON_SIZE = 52;
const DRAG_THRESHOLD_PX = 4;

interface TerminalButtonProps {
  x: number;
  y: number;
  isOpen: boolean;
  onMove: (x: number, y: number) => void;
  onMoveEnd: (x: number, y: number) => void;
  onToggle: () => void;
}

interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

function clampToViewport(x: number, y: number): { x: number; y: number } {
  const maxX = Math.max(window.innerWidth - TERMINAL_BUTTON_SIZE, 0);
  const maxY = Math.max(window.innerHeight - TERMINAL_BUTTON_SIZE, 0);
  return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
}

/** Floating circular launcher — drag to reposition (clamped to the
 *  viewport, live-updated via `onMove`), click to open/close the panel.
 *  Click vs. drag is decided by total pointer movement rather than the
 *  browser's native click event, since a `setPointerCapture` drag would
 *  otherwise still fire a spurious click on release. */
export function TerminalButton({ x, y, isOpen, onMove, onMoveEnd, onToggle }: TerminalButtonProps) {
  const dragRef = useRef<DragState | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, originX: x, originY: y, lastX: x, lastY: y, moved: false };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) drag.moved = true;
    const next = clampToViewport(drag.originX + dx, drag.originY + dy);
    drag.lastX = next.x;
    drag.lastY = next.y;
    onMove(next.x, next.y);
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) onMoveEnd(drag.lastX, drag.lastY);
    else onToggle();
  }

  return (
    <button
      type="button"
      title={isOpen ? 'close terminal' : 'open terminal'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="fixed z-40 flex items-center justify-center rounded-full border border-border-strong bg-bg text-fg-prominent transition-colors duration-panel ease-panel hover:border-accent-link hover:text-accent-link"
      style={{
        left: x,
        top: y,
        width: TERMINAL_BUTTON_SIZE,
        height: TERMINAL_BUTTON_SIZE,
        touchAction: 'none',
        boxShadow: 'var(--shadow-float)',
      }}
    >
      <TerminalIcon size={22} weight="regular" />
    </button>
  );
}
