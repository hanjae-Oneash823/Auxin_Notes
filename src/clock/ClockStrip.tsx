import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useElementWidth } from '../layout/useElementWidth';
import { ClockBlockView } from './ClockBlockView';
import { WeekTimelineButton } from './WeekTimelineButton';
import { usePlannerStore } from '../planner/plannerStore';
import { useSessionStore } from '../planner/sessionStore';
import { useSleepStore } from '../health/sleepStore';
import { useSettingsStore } from '../app/settings/settingsStore';
import { clockBlocks } from './clockBlocks';
import { SNAP_TO_NOW_MS, centerAfterDrag, stepClockRange, tickMarks, xForTime } from './clockGeometry';

const LABEL_HEIGHT = 18;
const BODY_HEIGHT = 42;
const BOTTOM_GAP = 4;
const INITIAL_WIDTH = 900;
const CLOCK_TICK_MS = 15_000;
/** Below this width, label every other tick so the numbers don't collide. */
const NARROW_STRIP_PX = 560;
/** The strip is black in both themes, so its ticks need a fixed light tone. */
const STRIP_BG = '#000';
const STRIP_TICK_COLOR = 'rgba(255, 255, 255, 0.08)';
const STRIP_MIDNIGHT_COLOR = '#ffe600';
/** The now-line eases down to this and back — a slow pulse, not a flash. */
const NOW_LINE_DIM_OPACITY = 0.35;
const NOW_LINE_BLINK_S = 2.4;
/** How long the "Now" button's glide back to the live clock takes. */
const GLIDE_MS = 500;
/** Whole days of blocks built on each side of the day being viewed, so a short pan never outruns them. */
const BLOCK_DAYS_EACH_SIDE = 2;
const DAY_MS = 24 * 3_600_000;
/** Wheel zoom: ignore tiny deltas, and wait this long between steps so one trackpad flick (with its inertia) is one level. */
const ZOOM_MIN_DELTA = 4;
const ZOOM_STEP_COOLDOWN_MS = 220;

interface DragState {
  startX: number;
  startCenterMs: number;
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Midnight shows the weekday, so panning across days stays legible; a tick between
 *  hours (when zoomed in) shows HH:MM, an hour tick just HH. */
function tickLabel(markMs: number): { text: string; isMidnight: boolean } {
  const date = new Date(markMs);
  const hour = date.getHours();
  const minutes = date.getMinutes();
  if (hour === 0 && minutes === 0) return { text: date.toLocaleDateString('en-US', { weekday: 'short' }), isMidnight: true };
  const hourText = String(hour).padStart(2, '0');
  return { text: minutes === 0 ? hourText : `${hourText}:${String(minutes).padStart(2, '0')}`, isMidnight: false };
}

/** A timeline across the top of the editing area: past on the left,
 *  future on the right, the current time at the center, spanning the range chosen in
 *  settings (24h, 12h, 4h or 2h). Drag to pan; once the
 *  strip is off-center a floating "Now" button brings it back. Timed nodes fill
 *  the top lane in their arc's color; work sessions fill the bottom lane, each
 *  holding a bar per node worked on; a night's sleep spans both lanes. */
export function ClockStrip() {
  const { ref, width } = useElementWidth<HTMLDivElement>(INITIAL_WIDTH);
  const [nowMs, setNowMs] = useState(Date.now);
  /** null = following the live clock; a number = parked there by a drag. */
  const [panCenterMs, setPanCenterMs] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const glideRef = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(
    () => () => {
      if (glideRef.current !== null) cancelAnimationFrame(glideRef.current);
    },
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const nodes = usePlannerStore((state) => state.nodes);
  const arcs = usePlannerStore((state) => state.arcs);
  const projects = usePlannerStore((state) => state.projects);
  const sessions = useSessionStore((state) => state.sessions);
  const sessionNodes = useSessionStore((state) => state.sessionNodes);
  const sleepEntries = useSleepStore((state) => state.entries);
  const range = useSettingsStore((state) => state.clockRange);
  const setClockRange = useSettingsStore((state) => state.setClockRange);
  const lastLogged = useSleepStore((state) => state.lastLogged);

  // Logging sleep pans the strip to that night (usually last night, which is off-screen),
  // parked there until the Now button or a drag back to the live time.
  useEffect(() => {
    if (!lastLogged) return;
    if (glideRef.current !== null) cancelAnimationFrame(glideRef.current);
    glideRef.current = null;
    setPanCenterMs((lastLogged.startMs + lastLogged.endMs) / 2);
  }, [lastLogged]);

  // Cmd + scroll (or a trackpad pinch, which arrives as Ctrl + wheel) over the strip zooms the
  // range one level: scroll up = closer. A native listener, because React's onWheel is passive
  // and couldn't stop the page from zooming.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let lastStepAt = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      if (Math.abs(event.deltaY) < ZOOM_MIN_DELTA || event.timeStamp - lastStepAt < ZOOM_STEP_COOLDOWN_MS) return;
      lastStepAt = event.timeStamp;
      void setClockRange(stepClockRange(range, event.deltaY < 0 ? 'in' : 'out'));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [ref, range, setClockRange]);

  const centerMs = panCenterMs ?? nowMs;
  // Keyed on the viewed day, so panning within a day doesn't rebuild the blocks.
  const viewedDayStartMs = startOfDay(centerMs);
  const blocks = useMemo(
    () =>
      clockBlocks(
        { nodes, sessions, sessionNodes, sleepEntries, arcs, projects },
        viewedDayStartMs - BLOCK_DAYS_EACH_SIDE * DAY_MS,
        viewedDayStartMs + (BLOCK_DAYS_EACH_SIDE + 1) * DAY_MS,
        nowMs,
      ),
    [nodes, sessions, sessionNodes, sleepEntries, arcs, projects, viewedDayStartMs, nowMs],
  );

  const isOffCenter = panCenterMs !== null;
  const isNowToTheRight = nowMs > centerMs;
  const nowX = xForTime(nowMs, centerMs, width, range);
  const labelEvery = width < NARROW_STRIP_PX ? 2 : 1;
  const marks = tickMarks(centerMs, range);

  function cancelGlide() {
    if (glideRef.current === null) return;
    cancelAnimationFrame(glideRef.current);
    glideRef.current = null;
  }

  /** Eases the strip from where it is to the live clock, then re-attaches it. */
  function glideToNow() {
    cancelGlide();
    if (shouldReduceMotion) {
      setPanCenterMs(null);
      return;
    }
    const fromMs = centerMs;
    const startedAt = performance.now();
    const step = (frameTime: number) => {
      const progress = Math.min(1, (frameTime - startedAt) / GLIDE_MS);
      if (progress >= 1) {
        glideRef.current = null;
        setPanCenterMs(null);
        return;
      }
      const eased = 1 - (1 - progress) ** 3;
      setPanCenterMs(fromMs + (Date.now() - fromMs) * eased);
      glideRef.current = requestAnimationFrame(step);
    };
    glideRef.current = requestAnimationFrame(step);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    cancelGlide();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startCenterMs: centerMs };
    setIsDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setPanCenterMs(centerAfterDrag(drag.startCenterMs, event.clientX - drag.startX, width, range));
  }

  function handlePointerEnd() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    setPanCenterMs((parked) => (parked !== null && Math.abs(parked - nowMs) < SNAP_TO_NOW_MS ? null : parked));
  }

  return (
    <div
      ref={ref}
      className="relative shrink-0 select-none border-b border-border"
      style={{ height: LABEL_HEIGHT + BODY_HEIGHT + BOTTOM_GAP, touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <WeekTimelineButton />
      <div className="relative" style={{ height: LABEL_HEIGHT, fontFamily: 'var(--font-family-mono)', fontSize: '0.64rem' }}>
        {marks.map((markMs, index) => {
          if (index % labelEvery !== 0) return null;
          const { text, isMidnight } = tickLabel(markMs);
          return (
            <span
              key={markMs}
              className={`absolute top-1 ${isMidnight ? 'font-bold text-fg-prominent' : 'text-fg-faint'}`}
              style={{ left: xForTime(markMs, centerMs, width, range), transform: 'translateX(-50%)' }}
            >
              {text}
            </span>
          );
        })}
      </div>

      <div className="relative overflow-hidden rounded-row" style={{ height: BODY_HEIGHT, background: STRIP_BG }}>
        {marks.map((markMs) => (
          <span
            key={markMs}
            className="absolute inset-y-0 w-px"
            style={{ left: xForTime(markMs, centerMs, width, range), background: tickLabel(markMs).isMidnight ? STRIP_MIDNIGHT_COLOR : STRIP_TICK_COLOR }}
          />
        ))}

        {blocks.map((block) => {
          const left = xForTime(block.startMs, centerMs, width, range);
          const right = xForTime(block.endMs, centerMs, width, range);
          if (right < 0 || left > width) return null;
          return (
            <ClockBlockView
              key={block.id}
              block={block}
              centerMs={centerMs}
              stripWidthPx={width}
              range={range}
              leftPx={left}
              widthPx={right - left}
              isPast={block.endMs < nowMs}
            />
          );
        })}

        <motion.span
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent-link"
          style={{ left: nowX - 1 }}
          animate={shouldReduceMotion ? undefined : { opacity: [1, NOW_LINE_DIM_OPACITY, 1] }}
          transition={{ duration: NOW_LINE_BLINK_S, ease: 'easeInOut', repeat: Infinity }}
        />

        {isOffCenter && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={glideToNow}
            className={`absolute top-1/2 -translate-y-1/2 rounded-full border border-border bg-bg-packet-card px-2.5 py-0.5 text-fg-prominent transition-colors duration-panel ease-panel hover:bg-bg-packet-active ${
              isNowToTheRight ? 'right-2' : 'left-12'
            }`}
            style={{ fontSize: '0.68rem', cursor: 'pointer', boxShadow: 'var(--shadow-float)' }}
          >
            {isNowToTheRight ? 'Now →' : '← Now'}
          </button>
        )}
      </div>
    </div>
  );
}
