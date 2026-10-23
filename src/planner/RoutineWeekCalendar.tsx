import { useEffect, useState } from 'react';
import { darkened } from '../clock/ClockBlockView';
import { WeekFrame, pct } from '../clock/WeekFrame';
import { weekDayStarts } from '../clock/weekGeometry';
import { useHoverTooltip } from '../layout/HoverTooltip';
import { addMinutesToTime } from './nodeDerived';
import { layoutDay, timeOfMinutes, type WeekBlock } from './routineWeek';

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;
const NOW_CHECK_MS = 60_000;
const BLOCK_INSET_PX = 2;
const MIN_BLOCK_HEIGHT_PX = 3;
const ALL_DAY_DOT_PX = 9;

interface RoutineWeekCalendarProps {
  weekOffset: number;
  onWeekOffsetChange: (offset: number) => void;
  /** The seven dates of the shown week, Monday first. */
  dates: readonly string[];
  /** Occurrences of the routines on show (any week); skipped days have no occurrence, so they never appear. */
  blocks: readonly WeekBlock[];
  onOpen: (block: WeekBlock) => void;
  onContextMenu: (block: WeekBlock, x: number, y: number) => void;
}

function labelOf(block: WeekBlock): string {
  const start = block.startMinutes;
  const time = start === null ? '' : ` · ${timeOfMinutes(start)}–${addMinutesToTime(timeOfMinutes(start), block.durationMinutes)}`;
  return `${block.title}${time}${block.isDone ? ' · done' : ''}`;
}

interface PieceProps {
  block: WeekBlock;
  column: number;
  columns: number;
  isPast: boolean;
  onOpen: () => void;
  onContextMenu: (x: number, y: number) => void;
}

/** One routine occurrence in its day column: a plain block whose name shows in Auxin's hover tooltip. A skipped day is a dashed outline. */
function BlockPiece({ block, column, columns, isPast, onOpen, onContextMenu }: PieceProps) {
  const { hoverProps, hide, tooltip } = useHoverTooltip(labelOf(block));
  const start = block.startMinutes as number;
  return (
    <>
      <div
        role="button"
        aria-label={labelOf(block)}
        {...hoverProps}
        onClick={() => { hide(); onOpen(); }}
        onContextMenu={(event) => { event.preventDefault(); hide(); onContextMenu(event.clientX, event.clientY); }}
        className="absolute cursor-pointer overflow-hidden hover:brightness-125"
        style={{
          top: pct(start / MINUTES_PER_DAY),
          height: `max(${MIN_BLOCK_HEIGHT_PX}px, ${pct(Math.min(block.durationMinutes, MINUTES_PER_DAY - start) / MINUTES_PER_DAY)})`,
          left: `calc(${(column / columns) * 100}% + ${BLOCK_INSET_PX}px)`,
          width: `calc(${100 / columns}% - ${BLOCK_INSET_PX * 2}px)`,
          background: isPast || block.isDone ? darkened(block.color) : block.color,
          border: '1px solid #000',
        }}
      />
      {tooltip}
    </>
  );
}

function AllDayDot({ block, onOpen, onContextMenu }: { block: WeekBlock; onOpen: () => void; onContextMenu: (x: number, y: number) => void }) {
  const { hoverProps, hide, tooltip } = useHoverTooltip(labelOf(block));
  return (
    <>
      <button
        type="button"
        aria-label={labelOf(block)}
        {...hoverProps}
        onClick={() => { hide(); onOpen(); }}
        onContextMenu={(event) => { event.preventDefault(); hide(); onContextMenu(event.clientX, event.clientY); }}
        className="hover:brightness-125"
        style={{
          width: ALL_DAY_DOT_PX, height: ALL_DAY_DOT_PX,
          background: block.isDone ? darkened(block.color) : block.color,
          border: '1px solid #000',
        }}
      />
      {tooltip}
    </>
  );
}

/** The week's routine occurrences on the same timetable as the clock strip's week popup. Right-click a block for skip, move and pause. */
export function RoutineWeekCalendar({ weekOffset, onWeekOffsetChange, dates, blocks, onOpen, onContextMenu }: RoutineWeekCalendarProps) {
  const [nowMs, setNowMs] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), NOW_CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const dayStarts = weekDayStarts(weekOffset, nowMs);
  const blocksOn = (dayIndex: number) => blocks.filter((block) => block.date === dates[dayIndex]);
  const dayLoads = dates.map((_, index) => {
    const day = blocksOn(index);
    return { count: day.length, minutes: day.reduce((total, block) => total + (block.startMinutes === null ? 0 : block.durationMinutes), 0) };
  });
  const hasAllDay = blocks.some((block) => dates.includes(block.date) && block.startMinutes === null);

  return (
    <WeekFrame
      weekOffset={weekOffset}
      onWeekOffsetChange={onWeekOffsetChange}
      nowMs={nowMs}
      dayStarts={dayStarts}
      dayLoads={dayLoads}
      isFillingHeight
      renderAllDay={hasAllDay ? (index) => blocksOn(index).filter((block) => block.startMinutes === null).map((block) => (
        <AllDayDot key={block.key} block={block} onOpen={() => onOpen(block)} onContextMenu={(x, y) => onContextMenu(block, x, y)} />
      )) : undefined}
      renderDay={(index) => {
        const timed = blocksOn(index).filter((block) => block.startMinutes !== null);
        const placed = layoutDay(timed);
        return placed.map(({ block, column, columns }) => (
          <BlockPiece
            key={block.key}
            block={block}
            column={column}
            columns={columns}
            isPast={dayStarts[index] + ((block.startMinutes as number) + block.durationMinutes) * MS_PER_MINUTE < nowMs}
            onOpen={() => onOpen(block)}
            onContextMenu={(x, y) => onContextMenu(block, x, y)}
          />
        ));
      }}
    />
  );
}
