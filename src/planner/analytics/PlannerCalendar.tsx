import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { PacketIconButton, SidebarPacket } from '../../layout/SidebarPacket';
import { PANEL_EASE } from '../plannerMotion';
import { usePlannerStore } from '../plannerStore';
import { TASK_COLOR, completionsByDay, dateKey, heatColor, monthCells } from './analyticsData';

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAY_LABELS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const SLIDE_PX = 28;
const LABEL_SLIDE_PX = 10;

type Direction = 1 | -1;

/** Mycelium's mini calendar: each day is heat-coloured by how many nodes were completed on it, with the count underneath.
 *  Hover a day to list what was done. */
export function PlannerCalendar() {
  const nodes = usePlannerStore((state) => state.nodes);
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [direction, setDirection] = useState<Direction>(1);
  const done = useMemo(() => completionsByDay(nodes), [nodes]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = useMemo(() => monthCells(year, month), [year, month]);
  const todayKey = dateKey(new Date());
  const monthKey = `${year}-${month}`;

  function step(delta: Direction) {
    setDirection(delta);
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

  return (
    <SidebarPacket
      title="Calendar"
      actions={
        <>
          <PacketIconButton title="previous month" onClick={() => step(-1)}><CaretLeft size={12} weight="bold" /></PacketIconButton>
          <PacketIconButton title="next month" onClick={() => step(1)}><CaretRight size={12} weight="bold" /></PacketIconButton>
        </>
      }
    >
      <div className="flex flex-col gap-1 px-1.5 pb-1.5">
        <div className="flex justify-center overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.span
              key={monthKey}
              custom={direction}
              variants={labelSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.16, ease: PANEL_EASE }}
              className="tracking-[0.2em] text-fg-prominent"
              style={{ fontSize: '0.9rem' }}
            >
              {MONTH_NAMES[month]} {year}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-7 text-center text-fg-faint" style={{ fontSize: '0.62rem' }}>
          {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
        </div>

        <div className="overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={monthKey}
              custom={direction}
              variants={gridSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: PANEL_EASE }}
              className="grid grid-cols-7 gap-0.5"
            >
              {cells.map((day, index) => {
                if (day === null) return <div key={index} />;
                const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const data = done.get(key);
                const isToday = key === todayKey;
                return (
                  <div
                    key={index}
                    title={data ? `${key}\n› ${data.titles.join('\n› ')}` : undefined}
                    className="flex flex-col items-center gap-0.5 pb-1 pt-0.5"
                    style={{ background: heatColor(data?.count ?? 0), boxShadow: isToday ? `inset 0 0 0 1px ${TASK_COLOR}` : undefined }}
                  >
                    <span
                      className={data && !isToday ? 'text-fg-prominent' : 'text-fg-faint'}
                      style={{ fontSize: '0.78rem', lineHeight: 1, color: isToday ? TASK_COLOR : undefined }}
                    >
                      {day}
                    </span>
                    <span
                      className="flex h-[15px] w-[15px] items-center justify-center rounded-full border border-white/20 bg-black/35 text-white/90"
                      style={{ fontSize: '0.64rem', lineHeight: 1, visibility: data ? 'visible' : 'hidden' }}
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
    </SidebarPacket>
  );
}
