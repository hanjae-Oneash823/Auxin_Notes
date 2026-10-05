// Runnable check for the session clock: `node --experimental-strip-types src/planner/sessionClock.check.ts`
import { formatDuration, formatTimer, lastActivityMs, resolveEndTime, sessionElapsedMs, sessionSpanMinutes } from './sessionClock.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`sessionClock check failed: ${message} (got ${actual}, expected ${expected})`);
}

const MINUTE = 60_000;
const T0 = Date.parse('2026-03-02T09:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * MINUTE).toISOString();
const running = { actualStart: at(0), actualEnd: null };
const pause = (from: number, to: number | null) => ({ id: 'p', sessionId: 's', pausedAt: at(from), resumedAt: to === null ? null : at(to), pauseType: 'manual' as const });

equal(sessionElapsedMs({ actualStart: null, actualEnd: null }, [], T0), 0, 'not started has no elapsed time');
equal(sessionElapsedMs(running, [], T0 + 5 * MINUTE), 5 * MINUTE, 'running time counts up');
equal(sessionElapsedMs(running, [pause(5, 15)], T0 + 20 * MINUTE), 10 * MINUTE, 'a closed pause is excluded');
equal(sessionElapsedMs(running, [pause(5, null)], T0 + 60 * MINUTE), 5 * MINUTE, 'an open pause freezes the clock');
equal(sessionElapsedMs({ actualStart: at(0), actualEnd: at(30) }, [], T0 + 999 * MINUTE), 30 * MINUTE, 'an ended session stops at its end');
equal(sessionElapsedMs({ actualStart: at(0), actualEnd: at(30) }, [pause(10, 20)], T0), 20 * MINUTE, 'ended session minus a pause');
equal(sessionSpanMinutes({ actualStart: at(0), actualEnd: at(95) }), 95, 'history span is end minus start');
equal(sessionSpanMinutes(running), null, 'an unfinished session has no span');
equal(formatTimer(65_000), '01:05', 'minutes:seconds under an hour');
equal(formatTimer(3_725_000), '01:02:05', 'hours appear once reached');
equal(formatDuration(95), '1h 35m', 'hours and minutes');
equal(formatDuration(0.2), '<1m', 'under a minute');
const noon = new Date(2026, 2, 2, 12, 0).getTime();
const startedAt9 = new Date(2026, 2, 2, 9, 0).toISOString();
const resolved = resolveEndTime('10:30', startedAt9, noon);
equal(resolved.isValid && new Date(resolved.iso).getHours(), 10, 'a past clock time today resolves to today');
equal(resolveEndTime('08:00', startedAt9, noon).isValid, false, 'before the start is rejected');
const overnight = resolveEndTime('22:00', new Date(2026, 2, 1, 20, 0).toISOString(), noon);
equal(overnight.isValid && new Date(overnight.iso).getDate(), 1, 'a later clock time resolves to the previous day');
equal(resolveEndTime('nope', startedAt9, noon).isValid, false, 'garbage is rejected');
equal(lastActivityMs([{ timeStarted: at(5), timeFinished: at(40) }], [pause(10, 20)]), T0 + 40 * MINUTE, 'last activity is the latest stamp');
equal(lastActivityMs([], []), null, 'no activity, no suggestion');
console.log('sessionClock: ok');
