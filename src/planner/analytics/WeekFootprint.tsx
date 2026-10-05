import { useMemo } from 'react';
import { SidebarPacket } from '../../layout/SidebarPacket';
import { usePlannerStore } from '../plannerStore';
import { useSessionStore } from '../sessionStore';
import { EVENT_MINUTES_COLOR, SESSION_COLOR, TASK_COLOR, footprint, type FootprintPoint } from './analyticsData';

const WIDTH = 280;
const HEIGHT = 96;
const PAD_TOP = 8;
const PAD_BOTTOM = 4;
const BAR_FRACTION = 0.62;
const TODAY_INDEX = 6;

interface Point { x: number; y: number }

/** A smooth curve through the points (Catmull-Rom → Bézier), kept inside the plot so it never dips below the baseline. */
function smoothPath(points: readonly Point[]): string {
  const clampY = (y: number) => Math.min(HEIGHT - PAD_BOTTOM, Math.max(PAD_TOP, y));
  const at = (i: number) => points[Math.min(points.length - 1, Math.max(0, i))];
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    path += ` C ${p1.x + (p2.x - p0.x) / 6} ${clampY(p1.y + (p2.y - p0.y) / 6)}, ${p2.x - (p3.x - p1.x) / 6} ${clampY(p2.y - (p3.y - p1.y) / 6)}, ${p2.x} ${p2.y}`;
  }
  return path;
}

/** Each series is scaled to its own peak (Mycelium plots them on separate axes). */
function seriesPoints(values: readonly number[]): Point[] {
  const peak = Math.max(1, ...values);
  const columnWidth = WIDTH / values.length;
  return values.map((value, i) => ({ x: (i + 0.5) * columnWidth, y: HEIGHT - PAD_BOTTOM - (value / peak) * (HEIGHT - PAD_BOTTOM - PAD_TOP) }));
}

const formatMinutes = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`);

function tooltipOf(point: FootprintPoint): string {
  return [`${point.date} · ${point.tasks} tasks`, point.sessionMins > 0 && `${formatMinutes(point.sessionMins)} session`, point.eventMins > 0 && `${formatMinutes(point.eventMins)} events`]
    .filter(Boolean)
    .join('\n');
}

/** Mycelium's 7-day footprint: bars for tasks done, plus lines for session and event minutes. */
export function WeekFootprint() {
  const nodes = usePlannerStore((state) => state.nodes);
  const sessions = useSessionStore((state) => state.sessions);
  const points = useMemo(() => footprint(nodes, sessions, new Date()), [nodes, sessions]);

  const tasks = seriesPoints(points.map((point) => point.tasks));
  const sessionLine = seriesPoints(points.map((point) => point.sessionMins));
  const eventLine = seriesPoints(points.map((point) => point.eventMins));
  const columnWidth = WIDTH / points.length;
  const barWidth = columnWidth * BAR_FRACTION;
  const todayTasks = points[TODAY_INDEX].tasks;
  const average = (points.reduce((sum, point) => sum + point.tasks, 0) / points.length).toFixed(1);

  const dots = (line: readonly Point[], color: string, todayColor: string) =>
    line.map((point, i) => <circle key={i} cx={point.x} cy={point.y} r={i === TODAY_INDEX ? 4 : 2.5} fill={i === TODAY_INDEX ? todayColor : color} />);

  return (
    <SidebarPacket title="7-day footprint">
      <div className="flex flex-col gap-1 px-1.5 pb-1.5">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Tasks done, session minutes and event minutes over the last seven days" className="w-full">
          {[0.25, 0.5, 0.75].map((fraction) => {
            const y = PAD_TOP + fraction * (HEIGHT - PAD_TOP - PAD_BOTTOM);
            return <line key={fraction} x1={0} x2={WIDTH} y1={y} y2={y} stroke="currentColor" className="text-border-subtle" strokeWidth={1} />;
          })}
          {tasks.map((point, i) => (
            <rect key={i} x={point.x - barWidth / 2} y={point.y} width={barWidth} height={HEIGHT - PAD_BOTTOM - point.y} fill={i === TODAY_INDEX ? 'rgba(245,200,66,0.18)' : 'rgba(0,196,167,0.18)'} />
          ))}
          <path d={smoothPath(sessionLine)} fill="none" stroke={SESSION_COLOR} strokeWidth={1.5} />
          {dots(sessionLine, 'rgba(245,200,66,0.6)', '#fff')}
          <path d={smoothPath(eventLine)} fill="none" stroke={EVENT_MINUTES_COLOR} strokeWidth={1.5} />
          {dots(eventLine, 'rgba(192,132,252,0.6)', SESSION_COLOR)}
          <path d={smoothPath(tasks)} fill="none" stroke={TASK_COLOR} strokeWidth={2.5} />
          {dots(tasks, 'rgba(255,255,255,0.5)', SESSION_COLOR)}
          {points.map((point, i) => (
            <rect key={point.date} x={columnWidth * i} y={0} width={columnWidth} height={HEIGHT} fill="transparent">
              <title>{tooltipOf(point)}</title>
            </rect>
          ))}
        </svg>

        <div className="grid grid-cols-7 text-center" style={{ fontSize: '0.78rem' }}>
          {points.map((point, i) => (
            <span key={point.date} className={i === TODAY_INDEX ? 'mx-auto px-1.5 font-semibold text-black' : 'text-fg-muted'} style={i === TODAY_INDEX ? { background: TASK_COLOR } : undefined}>
              {point.day}
            </span>
          ))}
        </div>

        <div className="flex justify-between px-0.5 pt-1 text-fg-muted" style={{ fontSize: '0.8rem' }}>
          <span>today <span style={{ color: TASK_COLOR }}>{todayTasks}</span></span>
          <span>7d avg <span className="text-fg-prominent">{average}</span></span>
        </div>
      </div>
    </SidebarPacket>
  );
}
