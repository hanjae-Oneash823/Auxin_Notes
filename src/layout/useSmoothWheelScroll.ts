import { useEffect, type RefObject } from 'react';
import { isWheelMouseNotch } from '../editor/extensions/smoothWheelPlugin';

// Same feel as the editor's own smoothWheelPlugin (see its comment for the
// rationale) — kept in sync by eye rather than a shared constant, since the
// two aren't expected to drift.
const EASE_FACTOR = 0.18;
const SNAP_THRESHOLD_PX = 0.5;
const DEFAULT_LINE_HEIGHT_PX = 16;

/**
 * Smooths mouse-wheel scrolling on a plain scrollable element — the
 * non-editor counterpart to the editor's createSmoothWheelPlugin, for panes
 * like the Home dashboard that scroll a native `overflow-y-auto` div rather
 * than a CodeMirror `scrollDOM`. Reuses the same wheel-mouse-notch detection
 * (isWheelMouseNotch) and rAF-lerp approach: trackpad input is left to
 * scroll natively (the OS already smooths it), only a mouse's discrete
 * per-notch jumps get eased toward a target scrollTop.
 */
export function useSmoothWheelScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;

    let target = scroller.scrollTop;
    let rafId: number | null = null;
    let lastTrackpadEventAt = Number.NEGATIVE_INFINITY;

    const deltaToPx = (delta: number, mode: number): number => {
      if (mode === 1) {
        const lineHeight = parseFloat(getComputedStyle(scroller).lineHeight);
        return delta * (Number.isFinite(lineHeight) ? lineHeight : DEFAULT_LINE_HEIGHT_PX);
      }
      if (mode === 2) return delta * scroller.clientHeight;
      return delta;
    };

    const cancelGlide = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    };

    const step = () => {
      const next = scroller.scrollTop + (target - scroller.scrollTop) * EASE_FACTOR;
      if (Math.abs(target - next) < SNAP_THRESHOLD_PX) {
        scroller.scrollTop = target;
        rafId = null;
        return;
      }
      scroller.scrollTop = next;
      rafId = requestAnimationFrame(step);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.deltaX !== 0 || event.deltaY === 0) return;
      if (!isWheelMouseNotch(event, event.timeStamp - lastTrackpadEventAt)) {
        lastTrackpadEventAt = event.timeStamp;
        cancelGlide();
        return;
      }
      event.preventDefault();

      const max = scroller.scrollHeight - scroller.clientHeight;
      if (rafId === null) target = scroller.scrollTop;
      target = Math.min(max, Math.max(0, target + deltaToPx(event.deltaY, event.deltaMode)));

      if (rafId === null) rafId = requestAnimationFrame(step);
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      cancelGlide();
    };
  }, [ref]);
}
