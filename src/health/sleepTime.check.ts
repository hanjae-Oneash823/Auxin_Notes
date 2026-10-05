// Runnable check for the sleep log's time math: `node --experimental-strip-types src/health/sleepTime.check.ts`
import { addDays, barSpanLabel, buildNight, clockOf, durationHours, formatHours, hhmmToPos, hourToPos, isLateBedtime, localDateTime, posToHHMM, snapPos, weekdayOf } from './sleepTime.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`sleepTime check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

// The bar: 22:00 at the left edge, 12:00 at the right, 5-minute snap.
equal([posToHHMM(0), posToHHMM(1)], ['22:00', '12:00'], 'bar ends');
equal(posToHHMM(hourToPos(0)), '00:00', 'midnight sits 2h in');
equal(posToHHMM(snapPos(hourToPos(0) + 0.001)), '00:00', 'a few minutes off snaps to the grid');
equal(posToHHMM(snapPos((2 * 60 + 7) / 840)), '00:05', 'snaps to the nearest 5 minutes');
equal([snapPos(-0.2), snapPos(1.4)], [0, 1], 'clamped to the bar');
equal(barSpanLabel(hourToPos(23), hourToPos(7)), '8h 00m', 'span between two positions');

// A night is dated by its evening.
equal(buildNight('2026-03-01', '23:00', '07:00'), { sleepStart: '2026-03-01T23:00:00', wakeTime: '2026-03-02T07:00:00' }, 'evening bedtime wakes next day');
equal(buildNight('2026-03-01', '01:30', '09:00'), { sleepStart: '2026-03-02T01:30:00', wakeTime: '2026-03-02T09:00:00' }, 'after-midnight bedtime is the next calendar day');
equal(buildNight('2026-03-01', '22:00', '12:00').wakeTime, '2026-03-02T12:00:00', 'a noon wake is still the next day after a 22:00 bedtime');
equal(buildNight('2026-02-28', '23:30', '06:00'), { sleepStart: '2026-02-28T23:30:00', wakeTime: '2026-03-01T06:00:00' }, 'rolls over a month end');
equal(addDays('2026-12-31', 1), '2027-01-01', 'year rollover');

equal(durationHours({ sleepStart: '2026-03-01T23:30:00', wakeTime: '2026-03-02T07:00:00' }), 7.5, 'duration in hours');
equal(formatHours(7.5), '7h 30m', 'formatted');
equal(localDateTime('2026-03-01', 25 * 60 + 15), '2026-03-02T01:15:00', 'minutes past midnight spill into the next day');

// Editing a saved night: its times map back onto the bar exactly, and ones outside the bar are refused.
equal([hhmmToPos('22:00'), hhmmToPos('12:00')], [0, 1], 'bar ends from clock times');
equal(posToHHMM(hhmmToPos('01:35') ?? -1), '01:35', 'a time that is not on the 5-minute grid round-trips');
equal(hhmmToPos('18:00'), null, 'an afternoon time is off the bar');
equal(clockOf('2026-03-02T01:30:00'), '01:30', 'clock part of a local datetime');
equal(weekdayOf('2026-10-01'), 'Thu', 'weekday of a date');

// Late means more than 30 minutes past the target, across midnight.
equal(isLateBedtime('01:31', '01:00'), true, 'a minute past the grace');
equal(isLateBedtime('01:30', '01:00'), false, '30 minutes is still on time');
equal(isLateBedtime('23:30', '01:00'), false, 'before midnight is early');
equal(isLateBedtime('00:30', '23:30'), true, 'a target before midnight, bedtime after it');

console.log('sleepTime: ok');
