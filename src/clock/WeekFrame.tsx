import type { ReactNode } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { HOUR_LABELS, dayFraction, loadShade } from './weekGeometry';

/** Shared with the button, which keeps the popup inside the window. */
export const WEEK_TIMELINE_WIDTH_PX = 380;
/** The grid's fixed height in the clock strip's popup. */
const POPUP_HOUR_PX = 20;
/** When the grid fills its parent instead, it never gets shorter than this. */
const MIN_FILL_GRID_PX = 24 * 14;
const HOURS_IN_DAY = 24;
const hourPct = (hour: number) => `${(hour / HOURS_IN_DAY) * 100}%`;
const LABEL_COL_PX = 32;
const KEY_HOURS = new Set([9, 12, 15, 18, 21, 24]);
const MAJOR_LINE_EVERY_HOURS = 3;
const NOW_COLOR = '#ff5555';
const TODAY_TINT = 'color-mix(in srgb, var(--accent-link) 8%, transparent)';
const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
export const MONO = { fontFamily: 'var(--font-family-mono)' } as const;

const monthDay = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const pct = (fraction: number) => `${fraction * 100}%`;

/** What one day column holds, for its count badge: how many timed items and how many minutes they fill (the badge's shade). */
export interface DayLoad {
  count: number;
  minutes: number;
}

interface WeekFrameProps {
  weekOffset: number;
  onWeekOffsetChange: (offset: number) => void;
  nowMs: number;
  /** The 8 local midnights bounding the week (see weekDayStarts). */
  dayStarts: readonly number[];
  dayLoads: readonly DayLoad[];
  /** Stretch the frame to its parent's height, with the grid taking whatever the header leaves. Default: a fixed-height grid, as in the clock strip's popup. */
  isFillingHeight?: boolean;
  /** The blocks of one day column; the column is `position: relative`, so they position with fractions of its height. */
  renderDay: (dayIndex: number) => ReactNode;
  /** An optional strip under the count badges for items with no time of day. */
  renderAllDay?: (dayIndex: number) => ReactNode;
}

/** The weekly timetable's frame, as in the clock strip's week popup: the week switcher, Monday-first day
 *  headers with a load badge each, and the 00–24 grid with the now line. The caller draws the blocks. */
export function WeekFrame({ weekOffset, onWeekOffsetChange, nowMs, dayStarts, dayLoads, isFillingHeight = false, renderDay, renderAllDay }: WeekFrameProps) {
  const days = DAY_NAMES.map((name, index) => ({
    name,
    start: dayStarts[index],
    end: dayStarts[index + 1],
    isToday: nowMs >= dayStarts[index] && nowMs < dayStarts[index + 1],
    count: dayLoads[index].count,
    shade: loadShade(dayLoads[index].minutes),
  }));

  return (
    <div className="flex flex-col gap-2 p-3 text-fg-muted" style={{ width: WEEK_TIMELINE_WIDTH_PX, height: isFillingHeight ? '100%' : undefined, fontSize: '0.75rem' }}>
      <div className="flex items-center justify-center gap-2 border border-border-subtle px-2 py-1" style={MONO}>
        <button type="button" aria-label="Previous week" onClick={() => onWeekOffsetChange(weekOffset - 1)} className="hover:text-fg-prominent">
          <CaretLeft size={13} />
        </button>
        <span className="text-fg-prominent">{monthDay(dayStarts[0])} – {monthDay(dayStarts[6])}</span>
        <button type="button" onClick={() => onWeekOffsetChange(0)} className={weekOffset === 0 ? 'text-accent-link' : 'text-fg-faint hover:text-fg-prominent'}>
          [this week]
        </button>
        <button type="button" aria-label="Next week" onClick={() => onWeekOffsetChange(weekOffset + 1)} className="hover:text-fg-prominent">
          <CaretRight size={13} />
        </button>
      </div>

      <div className="flex" style={{ paddingLeft: LABEL_COL_PX }}>
        {days.map((day) => (
          <div key={day.start} className="flex flex-1 flex-col items-center gap-0.5 border-b border-border-subtle pb-1">
            <span className={`uppercase ${day.isToday ? 'text-accent-link' : ''}`} style={{ ...MONO, letterSpacing: '0.1em' }}>{day.name}</span>
            <span
              className={`px-1.5 ${day.isToday ? 'bg-accent-link text-black' : 'text-fg-faint'}`}
              style={{ ...MONO, fontSize: '0.9rem', lineHeight: 1.3 }}
            >
              {new Date(day.start).getDate()}
            </span>
          </div>
        ))}
      </div>

      <div className="flex h-[18px]" style={{ paddingLeft: LABEL_COL_PX }}>
        {days.map((day) => (
          <div key={day.start} className="flex flex-1 justify-center">
            {day.shade && day.count > 0 && (
              <span className="flex h-[18px] w-[18px] items-center justify-center font-bold text-black" style={{ ...MONO, background: day.shade }}>
                {day.count}
              </span>
            )}
          </div>
        ))}
      </div>

      {renderAllDay && (
        <div className="flex" style={{ paddingLeft: LABEL_COL_PX }}>
          {days.map((day, index) => (
            <div key={day.start} className="flex flex-1 flex-wrap justify-center gap-0.5">{renderAllDay(index)}</div>
          ))}
        </div>
      )}

      <div className="relative flex" style={isFillingHeight ? { flex: '1 1 0', minHeight: MIN_FILL_GRID_PX } : { height: HOURS_IN_DAY * POPUP_HOUR_PX }}>
        <div className="relative shrink-0" style={{ width: LABEL_COL_PX }}>
          {HOUR_LABELS.map((hour) => {
            const isCurrentHour = days.some((day) => day.isToday) && hour === new Date(nowMs).getHours();
            return (
              <span
                key={hour}
                className={`absolute inset-x-0 text-center leading-none ${KEY_HOURS.has(hour) || isCurrentHour ? 'font-bold' : ''} ${KEY_HOURS.has(hour) ? 'text-fg-muted' : 'text-fg-faint'}`}
                style={{ ...MONO, top: `max(0px, calc(${hourPct(hour)} - 5px))`, color: isCurrentHour ? NOW_COLOR : undefined }}
              >
                {String(hour).padStart(2, '0')}
              </span>
            );
          })}
        </div>

        <div className="relative flex flex-1">
          {HOUR_LABELS.map((hour) => (
            <span
              key={hour}
              className="pointer-events-none absolute inset-x-0 h-px bg-fg-faint"
              style={{ top: hourPct(hour), opacity: hour % MAJOR_LINE_EVERY_HOURS === 0 ? 0.35 : 0.15 }}
            />
          ))}
          {days.map((day, index) => {
            const nowFraction = dayFraction(nowMs, day.start, day.end);
            return (
              <div key={day.start} className={`relative flex-1 ${index > 0 ? 'border-l border-border-subtle' : ''}`} style={{ background: day.isToday ? TODAY_TINT : undefined }}>
                {renderDay(index)}
                {nowFraction !== null && (
                  <span className="pointer-events-none absolute inset-x-0 h-0.5" style={{ top: pct(nowFraction), background: NOW_COLOR, zIndex: 5, boxShadow: `0 0 6px 1px ${NOW_COLOR}66` }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
