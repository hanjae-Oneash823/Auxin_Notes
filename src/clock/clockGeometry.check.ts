// Runnable check for the strip math: `node --experimental-strip-types src/clock/clockGeometry.check.ts`
import { CLOCK_RANGES, HOUR_MS, centerAfterDrag, stepClockRange, tickMarks, toClockRange, xForTime, type ClockRange } from './clockGeometry.ts';

function ok(condition: boolean, message: string): void {
  if (!condition) throw new Error(`clockGeometry check failed: ${message}`);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  ok(actual === expected, `${message} (got ${String(actual)}, expected ${String(expected)})`);
}

const WIDTH = 960;
const CENTER = new Date(2026, 9, 1, 16, 56).getTime();
const HOURS: Record<ClockRange, number> = { '24h': 24, '12h': 12, '4h': 4, '2h': 2 };

for (const range of CLOCK_RANGES) {
  const half = (HOURS[range] * HOUR_MS) / 2;
  // The center time sits at the middle of the strip; the edges are half the range away.
  equal(xForTime(CENTER, CENTER, WIDTH, range), WIDTH / 2, `${range}: center maps to the middle`);
  equal(xForTime(CENTER - half, CENTER, WIDTH, range), 0, `${range}: the earlier edge maps to the left`);
  equal(xForTime(CENTER + half, CENTER, WIDTH, range), WIDTH, `${range}: the later edge maps to the right`);

  // Dragging right by one hour's width reveals an hour earlier; round-trips back.
  const hourPx = WIDTH / HOURS[range];
  const dragged = centerAfterDrag(CENTER, hourPx, WIDTH, range);
  equal(dragged, CENTER - HOUR_MS, `${range}: dragging right reveals earlier time`);
  equal(centerAfterDrag(dragged, -hourPx, WIDTH, range), CENTER, `${range}: dragging back returns to the start`);
}

// Past is left of center, future is right.
ok(xForTime(CENTER - HOUR_MS, CENTER, WIDTH, '12h') < WIDTH / 2, 'past is left of center');
ok(xForTime(CENTER + HOUR_MS, CENTER, WIDTH, '12h') > WIDTH / 2, 'future is right of center');

// Ticks: hourly for 24h/12h, every 30 min for 4h, every 15 min for 2h; always on the grid, ascending, inside the window.
const expectedStepMinutes: Record<ClockRange, number> = { '24h': 60, '12h': 60, '4h': 30, '2h': 15 };
for (const range of CLOCK_RANGES) {
  const marks = tickMarks(CENTER, range);
  const stepMinutes = expectedStepMinutes[range];
  const hours = HOURS[range];
  ok(marks.every((mark) => new Date(mark).getMinutes() % stepMinutes === 0), `${range}: ticks sit on a ${stepMinutes}-minute grid`);
  ok(marks.every((mark, i) => i === 0 || mark - marks[i - 1] === stepMinutes * 60_000), `${range}: ticks are evenly spaced`);
  ok(marks.every((mark) => mark >= CENTER - (hours * HOUR_MS) / 2 && mark <= CENTER + (hours * HOUR_MS) / 2), `${range}: ticks stay inside the window`);
  const expected = (hours * 60) / stepMinutes;
  ok(marks.length === expected || marks.length === expected + 1, `${range}: ${marks.length} ticks, expected about ${expected}`);
}

// Saved values: anything unknown means 24h.
equal(toClockRange('4h'), '4h', 'a saved range is kept');
equal(toClockRange('7h'), '24h', 'an unknown range falls back');
equal(toClockRange(null), '24h', 'unset falls back');

// Zooming steps one level and stops at the ends.
equal(stepClockRange('24h', 'in'), '12h', 'zoom in from 24h');
equal(stepClockRange('12h', 'in'), '4h', 'zoom in from 12h');
equal(stepClockRange('4h', 'in'), '2h', 'zoom in from 4h');
equal(stepClockRange('2h', 'in'), '2h', 'already as zoomed in as it goes');
equal(stepClockRange('2h', 'out'), '4h', 'zoom out from 2h');
equal(stepClockRange('24h', 'out'), '24h', 'already as zoomed out as it goes');

console.log('clockGeometry: ok');
