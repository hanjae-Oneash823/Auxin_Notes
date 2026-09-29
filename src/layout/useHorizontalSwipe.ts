import { useRef } from 'react';
import type { WheelEvent as ReactWheelEvent } from 'react';

const SWIPE_DISTANCE_PX = 60;
/** Inertia deltas only ever shrink, so a delta this much bigger than the
 *  previous one (and above the noise floor) is a fresh swipe, not the tail. */
const NEW_SWIPE_GROWTH = 1.5;
const NEW_SWIPE_MIN_DELTA_PX = 6;
/** The tail counts as started once a delta falls below this share of the gesture's peak. */
const DECAY_PEAK_RATIO = 0.5;
/** Trackpad inertia keeps emitting wheel events after the fingers lift; a
 *  quiet gap this long marks the end of a gesture so it fires only once. */
const GESTURE_END_MS = 80;

/** Turns a two-finger horizontal trackpad swipe into one `onSwipe(±1)` per
 *  gesture (+1 = swipe left, i.e. deltaX > 0). Vertical-dominant scrolling
 *  is ignored so the panel still scrolls normally. */
export function useHorizontalSwipe(onSwipe?: (direction: 1 | -1) => void) {
  const accumulated = useRef(0);
  const hasFired = useRef(false);
  const lastEventAt = useRef(0);
  const lastDeltaX = useRef(0);
  /** Set once the fired gesture's deltas start shrinking (its inertia tail). */
  const hasDecayed = useRef(false);
  const peakDelta = useRef(0);

  return (event: ReactWheelEvent) => {
    if (!onSwipe || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const previous = lastDeltaX.current;
    lastDeltaX.current = event.deltaX;
    const isReversal = Math.sign(event.deltaX) !== Math.sign(previous);
    const magnitude = Math.abs(event.deltaX);
    peakDelta.current = Math.max(peakDelta.current, magnitude);
    if (hasFired.current && magnitude < peakDelta.current * DECAY_PEAK_RATIO) hasDecayed.current = true;
    // A rise only means "fingers are back" once the last swipe has decayed;
    // before that it's just the same hard swipe still accelerating.
    const isNewSwipe =
      hasDecayed.current &&
      Math.abs(event.deltaX) > NEW_SWIPE_MIN_DELTA_PX && Math.abs(event.deltaX) > Math.abs(previous) * NEW_SWIPE_GROWTH;
    if (event.timeStamp - lastEventAt.current > GESTURE_END_MS || isReversal || isNewSwipe) {
      accumulated.current = 0;
      hasFired.current = false;
      hasDecayed.current = false;
      peakDelta.current = 0;
    }
    lastEventAt.current = event.timeStamp;
    if (hasFired.current) return;
    accumulated.current += event.deltaX;
    if (Math.abs(accumulated.current) < SWIPE_DISTANCE_PX) return;
    hasFired.current = true;
    onSwipe(accumulated.current > 0 ? 1 : -1);
  };
}
