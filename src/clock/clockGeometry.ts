export const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** How much time the strip shows, with the center time in the middle. */
export type ClockRange = '24h' | '12h' | '4h' | '2h';
export const CLOCK_RANGES: readonly ClockRange[] = ['24h', '12h', '4h', '2h'];
export const DEFAULT_CLOCK_RANGE: ClockRange = '24h';

const RANGE_MS: Record<ClockRange, number> = { '24h': 24 * HOUR_MS, '12h': 12 * HOUR_MS, '4h': 4 * HOUR_MS, '2h': 2 * HOUR_MS };
/** Spacing of the tick marks: finer as the strip zooms in, so a short range still has a scale. */
const TICK_MS: Record<ClockRange, number> = { '24h': HOUR_MS, '12h': HOUR_MS, '4h': 30 * MINUTE_MS, '2h': 15 * MINUTE_MS };

/** A saved value back to a range; anything unknown (old or hand-edited config) falls back to the default. */
export const toClockRange = (value: string | null | undefined): ClockRange =>
  CLOCK_RANGES.find((range) => range === value) ?? DEFAULT_CLOCK_RANGE;

/** The next range one level in (a shorter span) or out, stopping at the ends. */
export function stepClockRange(range: ClockRange, direction: 'in' | 'out'): ClockRange {
  const index = CLOCK_RANGES.indexOf(range) + (direction === 'in' ? 1 : -1);
  return CLOCK_RANGES[Math.max(0, Math.min(CLOCK_RANGES.length - 1, index))];
}

/** Releasing a drag this close to now re-attaches the strip to the live clock. */
export const SNAP_TO_NOW_MS = 5 * MINUTE_MS;

/** Horizontal pixel of `timeMs` in a strip `widthPx` wide, centered on `centerMs`. */
export function xForTime(timeMs: number, centerMs: number, widthPx: number, range: ClockRange): number {
  const windowMs = RANGE_MS[range];
  return ((timeMs - (centerMs - windowMs / 2)) / windowMs) * widthPx;
}

/** Center time after dragging the strip `dxPx` to the right: the content moves
 *  with the pointer, so dragging right reveals earlier times. */
export function centerAfterDrag(startCenterMs: number, dxPx: number, widthPx: number, range: ClockRange): number {
  return startCenterMs - (dxPx * RANGE_MS[range]) / widthPx;
}

/** Every tick (on the hour, or the half/quarter hour when zoomed in) inside the window, as epoch ms, earliest first. */
export function tickMarks(centerMs: number, range: ClockRange): number[] {
  const startMs = centerMs - RANGE_MS[range] / 2;
  const endMs = centerMs + RANGE_MS[range] / 2;
  const stepMs = TICK_MS[range];
  const stepMinutes = stepMs / MINUTE_MS;
  const first = new Date(startMs);
  first.setMinutes(Math.floor(first.getMinutes() / stepMinutes) * stepMinutes, 0, 0);

  const marks: number[] = [];
  for (let markMs = first.getTime(); markMs <= endMs; markMs += stepMs) {
    if (markMs >= startMs) marks.push(markMs);
  }
  return marks;
}
