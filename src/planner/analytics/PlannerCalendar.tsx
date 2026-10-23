import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { SidebarPacket } from '../../layout/SidebarPacket';
import { usePlannerStore } from '../plannerStore';
import { TASK_COLOR, completionsByDay, dateKey, heatColor, monthCells } from './analyticsData';

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAY_LABELS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const SLIDE_PX = 28;
const LABEL_SLIDE_PX = 10;
/** Mycelium's easing curves for the grid slide and the month label. */
const GRID_EASE = [0.25, 0.46, 0.45, 0.94] as const;
const TOOLTIP_Z = 9500;
const TOOLTIP_GAP_PX = 8;
/** Every day cell is 6 wide by 7 tall. */
const CELL_ASPECT_RATIO = '6 / 7';
/** The calendar never grows wider than this (px), so its cells stay small in a wide column. */
const MAX_WIDTH_PX = 270;

type Direction = 1 | -1;

interface DayTooltip {
  x: number;
  y: number;
  date: string;
  titles: readonly string[];
}

/** Mycelium's mini calendar: each day is heat-coloured by how many nodes were completed on it, with the count underneath.
 *  Hover a day to list what was done. */
export function PlannerCalendar({ isTransparent = false }: { isTransparent?: boolean }) {
  const nodes = usePlannerStore((state) => state.nodes);
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [direction, setDirection] = useState<Direction>(1);
  const [tooltip, setTooltip] = useState<DayTooltip | null>(null);
  const done = useMemo(() => completionsByDay(nodes), [nodes]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = useMemo(() => monthCells(year, month), [year, month]);
  const todayKey = dateKey(new Date());
  const monthKey = `${year}-${month}`;

  function step(delta: Direction) {
    setDirection(delta);
    setTooltip(null);
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  const gridSlide = {
    initial: (dir: Direction) => ({ opacity: 0, x: dir * SLIDE_PX }),
    animate: { opacity: 1, x: 0 },
    exit: (dir: Direction) => ({ opacity: 0, x: -dir * SLIDE_PX }),
  };
  const labelSlide = {
    initial: (dir: Direction) => ({ opacity: 0, y: dir * LABEL_SLIDE_PX }),
    animate: { opacity: 1, y: 0 },
    exit: (dir: Direction) => ({ opacity: 0, y: -dir * LABEL_SLIDE_PX }),
  };
  const navButton = 'flex items-center px-1 text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent';

  return (
    <SidebarPacket title="Calendar" isTransparent={isTransparent}>
      <div className="mx-auto flex flex-col gap-1 pb-2" style={{ width: '100%', maxWidth: MAX_WIDTH_PX }}>
        <div className="mb-2 mt-4 flex items-center justify-between">
          <button type="button" aria-label="previous month" onClick={() => step(-1)} className={navButton}><CaretLeft size={14} weight="bold" /></button>
          <div className="flex items-center overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.span
                key={monthKey}
                custom={direction}
                variants={labelSlide}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.16, ease: 'easeInOut' }}
                className="tracking-[0.2em] text-fg-prominent"
                style={{ fontSize: '0.8rem' }}
              >
                {MONTH_NAMES[month]} {year}
              </motion.span>
            </AnimatePresence>
          </div>
          <button type="button" aria-label="next month" onClick={() => step(1)} className={navButton}><CaretRight size={14} weight="bold" /></button>
        </div>

        <div className="mb-1 grid grid-cols-7 text-center text-fg-faint" style={{ fontSize: '0.62rem' }}>
          {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
        </div>

        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={monthKey}
              custom={direction}
              variants={gridSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: GRID_EASE }}
              className="grid grid-cols-7 gap-0.5"
            >
              {cells.map((day, index) => {
                if (day === null) return <div key={index} style={{ aspectRatio: CELL_ASPECT_RATIO }} />;
                const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const data = done.get(key);
                const isToday = key === todayKey;
                return (
                  <div
                    key={index}
                    onMouseEnter={data ? (event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setTooltip({ x: rect.left + rect.width / 2, y: rect.top, date: key, titles: data.titles });
                    } : undefined}
                    onMouseLeave={data ? () => setTooltip(null) : undefined}
                    className="flex flex-col items-center justify-center gap-1"
                    style={{ aspectRatio: CELL_ASPECT_RATIO, background: heatColor(data?.count ?? 0), boxShadow: isToday ? `inset 0 0 0 1px ${TASK_COLOR}` : undefined }}
                  >
                    <span
                      className={data && !isToday ? 'text-fg-prominent' : 'text-fg-faint'}
                      style={{ fontSize: '0.74rem', lineHeight: 1, color: isToday ? TASK_COLOR : undefined, textShadow: isToday ? `0 0 10px ${TASK_COLOR}88` : undefined }}
                    >
                      {day}
                    </span>
                    <span
                      className="flex h-4 w-4 items-center justify-center border border-white/20 bg-black/35 text-white/90"
                      style={{ fontSize: '0.62rem', lineHeight: 1, visibility: data ? 'visible' : 'hidden' }}
                    >
                      {data?.count ?? 0}
                    </span>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {tooltip && createPortal(
        <div
          className="pointer-events-none fixed shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y - TOOLTIP_GAP_PX,
            transform: 'translate(-50%, -100%)',
            background: '#0c0c0c',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '5px 10px 6px',
            zIndex: TOOLTIP_Z,
            minWidth: 120,
            maxWidth: 220,
          }}
        >
          <div style={{ fontSize: '0.74rem', letterSpacing: '0.12em', color: TASK_COLOR, marginBottom: 4 }}>{tooltip.date}</div>
          {tooltip.titles.map((title, index) => (
            <div key={index} className="truncate whitespace-nowrap text-fg-muted" style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>› {title}</div>
          ))}
        </div>,
        document.body,
      )}
    </SidebarPacket>
  );
}
