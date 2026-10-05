// Runnable check: `node --experimental-strip-types src/clock/weekGeometry.check.ts`
import { dayFraction, dayPieces, loadShade, weekDayStarts } from './weekGeometry.ts';

function ok(condition: boolean, message: string): void {
  if (!condition) throw new Error(`weekGeometry check failed: ${message}`);
}

// Fri 2 Oct 2026, 15:00 local: its week runs Mon 28 Sep – Sun 4 Oct.
const now = new Date(2026, 9, 2, 15, 0).getTime();
const starts = weekDayStarts(0, now);
ok(starts.length === 8, 'eight boundaries');
ok(new Date(starts[0]).getDate() === 28 && new Date(starts[0]).getDay() === 1, 'week starts Monday 28th');
ok(new Date(starts[7]).getDate() === 5, 'ends at the next Monday');
ok(new Date(weekDayStarts(1, now)[0]).getDate() === 5, 'offset 1 is next week');
ok(new Date(weekDayStarts(0, new Date(2026, 9, 4, 12).getTime())[0]).getDate() === 28, 'Sunday still belongs to the Monday-first week before it');

const wed22h = starts[2] + 22 * 3_600_000;
const pieces = dayPieces(wed22h, wed22h + 4 * 3_600_000, starts);
ok(pieces.length === 2 && pieces[0].dayIndex === 2 && pieces[1].dayIndex === 3, 'a night block splits at midnight');
ok(Math.abs(pieces[0].topFraction - 22 / 24) < 1e-9 && Math.abs(pieces[0].heightFraction - 2 / 24) < 1e-9, 'first piece runs 22:00 to midnight');
ok(Math.abs(pieces[1].topFraction) < 1e-9 && Math.abs(pieces[1].heightFraction - 2 / 24) < 1e-9, 'second piece runs midnight to 02:00');
ok(dayPieces(starts[0] - 5_000, starts[0] - 1, starts).length === 0, 'blocks outside the week have no pieces');
ok(dayFraction(starts[4] + 12 * 3_600_000, starts[4], starts[5]) === 0.5, 'noon is half way');
ok(dayFraction(starts[5], starts[4], starts[5]) === null, 'the next midnight is not in this day');
ok(loadShade(0) === null && loadShade(30) === '#fff9c4' && loadShade(10_000) === '#a06000', 'load shades clamp at both ends');
console.log('weekGeometry check passed');
