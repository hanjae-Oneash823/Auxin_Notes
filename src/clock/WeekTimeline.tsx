import { useEffect, useMemo, useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useHoverTooltip } from '../layout/HoverTooltip';
import { useSleepStore } from '../health/sleepStore';
import { usePlannerStore } from '../planner/plannerStore';
import { useSessionStore } from '../planner/sessionStore';
import { clockBlocks, type ClockBlock, type ClockSegment, SLEEP_COLOR } from './clockBlocks';
import {
  FINISHED_SEGMENT_PERCENT, LIVE_SESSION_BORDER, SEGMENT_HEIGHT_PX, SESSION_BODY, SESSION_BORDER, UNFINISHED_SEGMENT_PERCENT, darkened, segmentColor,
} from './ClockBlockView';
import { HOUR_LABELS, dayFraction, dayPieces, loadShade, weekDayStarts, type DayPiece } from './weekGeometry';

/** Shared with the button, which keeps the popup inside the window. */
export const WEEK_TIMELINE_WIDTH_PX = 380;
const HOUR_PX = 20;
const GRID_HEIGHT_PX = 24 * HOUR_PX;
const LABEL_COL_PX = 32;
const KEY_HOURS = new Set([9, 12, 15, 18, 21, 24]);
const MAJOR_LINE_EVERY_HOURS = 3;
const NOW_CHECK_MS = 60_000;
const NOW_COLOR = '#ff5555';
const SLEEP_BODY = `color-mix(in srgb, ${SLEEP_COLOR} 22%, #000)`;
const SLEEP_BORDER = `color-mix(in srgb, ${SLEEP_COLOR} 70%, transparent)`;
const TODAY_TINT = 'color-mix(in srgb, var(--accent-link) 8%, transparent)';
const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
const MONO = { fontFamily: 'var(--font-family-mono)' } as const;

const monthDay = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const pct = (fraction: number) => `${fraction * 100}%`;

/** One block's piece in a day column; its name shows in Auxin's hover tooltip. */
function WeekBlockPiece({ label, piece, className = '', style }: { label: string; piece: DayPiece; className?: string; style: React.CSSProperties }) {
  const { hoverProps, tooltip } = useHoverTooltip(label);
  return (
    <>
      <div
        role="img"
        aria-label={label}
        {...hoverProps}
        className={`absolute overflow-hidden hover:brightness-125 ${className}`}
        style={{ top: pct(piece.topFraction), height: `max(3px, ${pct(piece.heightFraction)})`, left: 3, right: 3, ...style }}
      />
      {tooltip}
    </>
  );
}

function SegmentPiece({ segment, piece }: { segment: ClockSegment; piece: DayPiece }) {
  return (
    <span
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{
        top: pct(piece.topFraction),
        height: `max(3px, ${pct(piece.heightFraction)})`,
        width: SEGMENT_HEIGHT_PX - 2,
        zIndex: 3,
        background: segmentColor(segment.color, segment.isFinished ? FINISHED_SEGMENT_PERCENT : UNFINISHED_SEGMENT_PERCENT),
      }}
    />
  );
}

/** Pieces of every block of the week in one day column. Sleep and sessions sit under the timed nodes. */
function DayColumnBlocks({ blocks, dayStarts, dayIndex, nowMs }: { blocks: readonly ClockBlock[]; dayStarts: readonly number[]; dayIndex: number; nowMs: number }) {
  return (
    <>
      {blocks.flatMap((block) => {
        const piece = dayPieces(block.startMs, block.endMs, dayStarts).find((candidate) => candidate.dayIndex === dayIndex);
        if (!piece) return [];
        if (block.lane === 'sleep') {
          return [<WeekBlockPiece key={block.id} label={block.label} piece={piece} style={{ zIndex: 1, background: SLEEP_BODY, border: `1px solid ${SLEEP_BORDER}` }} />];
        }
        if (block.lane === 'planned') {
          const background = block.endMs < nowMs ? darkened(block.color) : block.color;
          return [<WeekBlockPiece key={block.id} label={block.label} piece={piece} style={{ zIndex: 2, background, border: '1px solid #000' }} />];
        }
        const sessionBox = (
          <WeekBlockPiece
            key={block.id}
            label={block.label}
            piece={piece}
            style={{ zIndex: 1, background: SESSION_BODY, border: `1.5px solid ${block.isLive ? LIVE_SESSION_BORDER : SESSION_BORDER}` }}
          />
        );
        const bars = block.segments.flatMap((segment) =>
          dayPieces(segment.startMs, segment.endMs, dayStarts)
            .filter((segmentPiece) => segmentPiece.dayIndex === dayIndex)
            .map((segmentPiece) => <SegmentPiece key={`${block.id}-${segment.id}`} segment={segment} piece={segmentPiece} />),
        );
        return [sessionBox, ...bars];
      })}
    </>
  );
}

/** The popup under the clock strip's week button — Mycelium's weekly timetable: a Monday-first
 *  week with a per-day count of timed nodes, then 00–24 columns holding the planned nodes (arc
 *  color), work sessions (dark, with a bar per node worked) and nights of sleep. */
export function WeekTimeline() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now);
  const nodes = usePlannerStore((state) => state.nodes);
  const arcs = usePlannerStore((state) => state.arcs);
  const projects = usePlannerStore((state) => state.projects);
  const sessions = useSessionStore((state) => state.sessions);
  const sessionNodes = useSessionStore((state) => state.sessionNodes);
  const sleepEntries = useSleepStore((state) => state.entries);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), NOW_CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const dayStarts = useMemo(() => weekDayStarts(weekOffset, nowMs), [weekOffset, nowMs]);
  const blocks = useMemo(
    () => clockBlocks({ nodes, sessions, sessionNodes, sleepEntries, arcs, projects }, dayStarts[0], dayStarts[7], nowMs),
    [nodes, sessions, sessionNodes, sleepEntries, arcs, projects, dayStarts, nowMs],
  );

  const days = DAY_NAMES.map((name, index) => {
    const planned = blocks.filter((block) => block.lane === 'planned' && block.startMs >= dayStarts[index] && block.startMs < dayStarts[index + 1]);
    return {
      name,
      start: dayStarts[index],
      end: dayStarts[index + 1],
      isToday: nowMs >= dayStarts[index] && nowMs < dayStarts[index + 1],
      plannedCount: planned.length,
      shade: loadShade(planned.reduce((total, block) => total + (block.endMs - block.startMs) / 60_000, 0)),
    };
  });

  return (
    <div className="flex flex-col gap-2 p-3 text-fg-muted" style={{ width: WEEK_TIMELINE_WIDTH_PX, fontSize: '0.75rem' }}>
      <div className="flex items-center justify-center gap-2 border border-border-subtle px-2 py-1" style={MONO}>
        <button type="button" aria-label="Previous week" onClick={() => setWeekOffset((offset) => offset - 1)} className="hover:text-fg-prominent">
          <CaretLeft size={13} />
        </button>
        <span className="text-fg-prominent">{monthDay(dayStarts[0])} – {monthDay(dayStarts[6])}</span>
        <button type="button" onClick={() => setWeekOffset(0)} className={weekOffset === 0 ? 'text-accent-link' : 'text-fg-faint hover:text-fg-prominent'}>
          [this week]
        </button>
        <button type="button" aria-label="Next week" onClick={() => setWeekOffset((offset) => offset + 1)} className="hover:text-fg-prominent">
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
            {day.shade && day.plannedCount > 0 && (
              <span className="flex h-[18px] w-[18px] items-center justify-center font-bold text-black" style={{ ...MONO, background: day.shade }}>
                {day.plannedCount}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="relative flex" style={{ height: GRID_HEIGHT_PX }}>
        <div className="relative shrink-0" style={{ width: LABEL_COL_PX }}>
          {HOUR_LABELS.map((hour) => {
            const isCurrentHour = days.some((day) => day.isToday) && hour === new Date(nowMs).getHours();
            return (
              <span
                key={hour}
                className={`absolute inset-x-0 text-center leading-none ${KEY_HOURS.has(hour) || isCurrentHour ? 'font-bold' : ''} ${KEY_HOURS.has(hour) ? 'text-fg-muted' : 'text-fg-faint'}`}
                style={{ ...MONO, top: Math.max(0, hour * HOUR_PX - 5), color: isCurrentHour ? NOW_COLOR : undefined }}
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
              style={{ top: hour * HOUR_PX, opacity: hour % MAJOR_LINE_EVERY_HOURS === 0 ? 0.35 : 0.15 }}
            />
          ))}
          {days.map((day, index) => {
            const nowFraction = dayFraction(nowMs, day.start, day.end);
            return (
              <div key={day.start} className={`relative flex-1 ${index > 0 ? 'border-l border-border-subtle' : ''}`} style={{ background: day.isToday ? TODAY_TINT : undefined }}>
                <DayColumnBlocks blocks={blocks} dayStarts={dayStarts} dayIndex={index} nowMs={nowMs} />
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
