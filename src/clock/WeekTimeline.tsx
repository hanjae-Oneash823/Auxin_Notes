import { useEffect, useMemo, useState } from 'react';
import { useHoverTooltip } from '../layout/HoverTooltip';
import { useSleepStore } from '../health/sleepStore';
import { usePlannerStore } from '../planner/plannerStore';
import { useSessionStore } from '../planner/sessionStore';
import { clockBlocks, type ClockBlock, type ClockSegment, SLEEP_COLOR } from './clockBlocks';
import {
  FINISHED_SEGMENT_PERCENT, LIVE_SESSION_BORDER, SEGMENT_HEIGHT_PX, SESSION_BODY, SESSION_BORDER, UNFINISHED_SEGMENT_PERCENT, darkened, segmentColor,
} from './ClockBlockView';
import { WeekFrame, pct } from './WeekFrame';
import { dayPieces, weekDayStarts, type DayPiece } from './weekGeometry';

const NOW_CHECK_MS = 60_000;
const SLEEP_BODY = `color-mix(in srgb, ${SLEEP_COLOR} 22%, #000)`;
const SLEEP_BORDER = `color-mix(in srgb, ${SLEEP_COLOR} 70%, transparent)`;

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

  const dayLoads = Array.from({ length: 7 }, (_, index) => {
    const planned = blocks.filter((block) => block.lane === 'planned' && block.startMs >= dayStarts[index] && block.startMs < dayStarts[index + 1]);
    return { count: planned.length, minutes: planned.reduce((total, block) => total + (block.endMs - block.startMs) / 60_000, 0) };
  });

  return (
    <WeekFrame
      weekOffset={weekOffset}
      onWeekOffsetChange={setWeekOffset}
      nowMs={nowMs}
      dayStarts={dayStarts}
      dayLoads={dayLoads}
      isFillingHeight
      renderDay={(index) => <DayColumnBlocks blocks={blocks} dayStarts={dayStarts} dayIndex={index} nowMs={nowMs} />}
    />
  );
}
