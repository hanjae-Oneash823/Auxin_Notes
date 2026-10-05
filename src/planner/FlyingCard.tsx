import { useEffect, useRef } from 'react';

export interface FlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FlyingCardProps {
  title: string;
  /** Arc color of the check dot; the real row's dot uses the same one. */
  dotColor: string;
  /** Where the card takes off from (the quick input bar). */
  from: FlightRect;
  /** The real row's id (its `data-task-id`); the card chases that row's live rectangle. */
  nodeId: string;
  /** Where to head until the real row exists (it appears a moment after the save). */
  getFallback: () => FlightRect;
  onDone: () => void;
}

/** Time constant of the chase: smaller is snappier. The card closes ~63% of the gap per tau. */
const CHASE_TAU_S = 0.07;
/** Never land sooner than this, so a short hop still reads as a flight. */
const MIN_FLIGHT_S = 0.25;
/** Give up and land after this long (e.g. the save failed and no row ever appears). */
const MAX_FLIGHT_S = 2;
const MAX_FRAME_S = 0.05;
const SETTLE_PX = 1.5;

const toRect = (rect: DOMRect): FlightRect => ({ x: rect.left, y: rect.top, w: rect.width, h: rect.height });
const gap = (a: FlightRect, b: FlightRect) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));

/**
 * A copy of the new task's row that flies out of the quick input and chases the real row's
 * position and size every frame, so it stays in sync while the pool panels resize around the
 * arriving row. It calls `onDone` once it has settled onto the row.
 */
export function FlyingCard({ title, dotColor, from, nodeId, getFallback, onDone }: FlyingCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ getFallback, onDone });
  latest.current = { getFallback, onDone };

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let current = from;
    let previous = performance.now();
    const start = previous;
    let frame = 0;

    const paint = () => {
      element.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
      element.style.width = `${current.w}px`;
      element.style.height = `${current.h}px`;
    };
    paint();

    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, MAX_FRAME_S);
      previous = now;
      const row = document.querySelector<HTMLElement>(`[data-task-id="${nodeId}"]`);
      const target = row ? toRect(row.getBoundingClientRect()) : latest.current.getFallback();
      const k = 1 - Math.exp(-dt / CHASE_TAU_S);
      current = {
        x: current.x + (target.x - current.x) * k,
        y: current.y + (target.y - current.y) * k,
        w: current.w + (target.w - current.w) * k,
        h: current.h + (target.h - current.h) * k,
      };
      paint();

      const elapsed = (now - start) / 1000;
      const hasSettled = row !== null && elapsed > MIN_FLIGHT_S && gap(current, target) < SETTLE_PX;
      if (hasSettled || elapsed > MAX_FLIGHT_S) {
        latest.current.onDone();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The flight starts once; later prop changes are read through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[60] flex items-center gap-3 overflow-hidden rounded-tab border border-border-strong bg-bg px-3 text-fg-prominent"
      style={{ boxShadow: '0 6px 18px rgba(0,0,0,0.4)', willChange: 'transform, width, height' }}
    >
      <span className="h-4 w-4 shrink-0 rounded-full border" style={{ borderColor: dotColor }} />
      <span className="truncate">{title}</span>
    </div>
  );
}
