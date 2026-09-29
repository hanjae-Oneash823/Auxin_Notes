import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Terminal as TerminalIcon } from '@phosphor-icons/react';

export const TERMINAL_BUTTON_SIZE = 52;
const DRAG_THRESHOLD_PX = 4;
const FLING_MIN_SPEED = 0.3; // px/ms on release needed to launch
const FLING_EDGE_MARGIN_PX = 20; // gap left between the button and the viewport edge
const FLING_MIN_MS = 250;
const FLING_MAX_MS = 1200;

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
  vx: number;
  vy: number;
  lastT: number;
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
  const flingRef = useRef<number | null>(null);

  function stopFling() {
    if (flingRef.current !== null) cancelAnimationFrame(flingRef.current);
    flingRef.current = null;
  }

  useEffect(() => stopFling, []);

  /** Glide from (x, y) along (vx, vy) px/ms to just short of the viewport
   *  edge that direction points at, decelerating to a stop there however hard the launch. */
  function startFling(startX: number, startY: number, vx: number, vy: number) {
    const maxX = Math.max(window.innerWidth - TERMINAL_BUTTON_SIZE - FLING_EDGE_MARGIN_PX, 0);
    const maxY = Math.max(window.innerHeight - TERMINAL_BUTTON_SIZE - FLING_EDGE_MARGIN_PX, 0);
    const minPos = FLING_EDGE_MARGIN_PX;
    const timeToEdge = (pos: number, v: number, max: number) => (v > 0 ? (max - pos) / v : v < 0 ? (minPos - pos) / v : Infinity);
    // Negative if already inside the margin; clamp so it never glides backwards.
    const t = Math.max(Math.min(timeToEdge(startX, vx, maxX), timeToEdge(startY, vy, maxY)), 0);
    const endX = startX + vx * t;
    const endY = startY + vy * t;
    const distance = Math.hypot(endX - startX, endY - startY);
    // Ease-out cubic starts at 3x average speed, so this matches the release speed.
    const duration = Math.min(Math.max((3 * distance) / Math.hypot(vx, vy), FLING_MIN_MS), FLING_MAX_MS);
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const px = startX + (endX - startX) * eased;
      const py = startY + (endY - startY) * eased;
      onMove(px, py);
      if (progress >= 1) {
        flingRef.current = null;
        onMoveEnd(endX, endY);
        return;
      }
      flingRef.current = requestAnimationFrame(step);
    };
    flingRef.current = requestAnimationFrame(step);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    stopFling();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, originX: x, originY: y, lastX: x, lastY: y, vx: 0, vy: 0, lastT: performance.now(), moved: false };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) drag.moved = true;
    const next = clampToViewport(drag.originX + dx, drag.originY + dy);
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) {
      // Smoothed velocity so one jittery frame doesn't dominate the launch.
      drag.vx = 0.6 * ((next.x - drag.lastX) / dt) + 0.4 * drag.vx;
      drag.vy = 0.6 * ((next.y - drag.lastY) / dt) + 0.4 * drag.vy;
    }
    drag.lastT = now;
    drag.lastX = next.x;
    drag.lastY = next.y;
    onMove(next.x, next.y);
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (!drag.moved) return onToggle();
    // A pause before release means the pointer stopped: no launch.
    const isFresh = performance.now() - drag.lastT < 80;
    if (isFresh && Math.hypot(drag.vx, drag.vy) > FLING_MIN_SPEED) startFling(drag.lastX, drag.lastY, drag.vx, drag.vy);
    else onMoveEnd(drag.lastX, drag.lastY);
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
