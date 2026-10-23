import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SidebarPacket } from '../../layout/SidebarPacket';
import { usePlannerStore } from '../plannerStore';
import { useSessionStore } from '../sessionStore';
import { EVENT_MINUTES_COLOR, SESSION_COLOR, TASK_COLOR, dateKey, footprint } from './analyticsData';

const CHART_HEIGHT_PX = 132;
const CHART_WIDTH = '93%';
/** What the chart assumes until it has measured its box; without a positive size recharts warns on the first render. */
const INITIAL_DIMENSION = { width: 280, height: CHART_HEIGHT_PX };
const BAR_FILL = 'rgba(0,196,167,0.18)';
const GRID_STROKE = 'rgba(255,255,255,0.05)';
const TICK_FONT_PX = 12;
const TODAY_TAG = { width: 24, height: 17 };
const DOT_RADIUS = 2.5;
const TODAY_DOT_RADIUS = 4;
/** Grid lines sit at these fractions of the plot height from the top: the top edge is left out on purpose. */
const GRID_LINE_FRACTIONS = [0.25, 0.5, 0.75, 1];

interface ChartPoint {
  date: string;
  day: string;
  count: number;
  sessionMins: number;
  eventMins: number;
}

const formatMinutes = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`);

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

/** Mycelium's 7-day footprint, drawn the same way it is there: a recharts ComposedChart with task-count bars and
 *  smooth monotone lines for task count, session minutes and event minutes, each on its own hidden axis. Hovering a
 *  day glides the tooltip and highlight to it. */
export function WeekFootprint({ isTransparent = false }: { isTransparent?: boolean }) {
  const nodes = usePlannerStore((state) => state.nodes);
  const sessions = useSessionStore((state) => state.sessions);
  const points = useMemo<ChartPoint[]>(
    () => footprint(nodes, sessions, new Date()).map((point) => ({ date: point.date, day: point.day, count: point.tasks, sessionMins: point.sessionMins, eventMins: point.eventMins })),
    [nodes, sessions],
  );

  const todayKey = dateKey(new Date());
  const isToday = (index: number | undefined) => index !== undefined && points[index]?.date === todayKey;

  /** A dot that is larger and highlighted on today's point, like Mycelium's. */
  const dotFor = (todayFill: string, otherFill: string) => (props: DotProps) => (
    <circle key={props.index} cx={props.cx} cy={props.cy} r={isToday(props.index) ? TODAY_DOT_RADIUS : DOT_RADIUS} fill={isToday(props.index) ? todayFill : otherFill} stroke="none" />
  );

  return (
    <SidebarPacket title="7-day history" isTransparent={isTransparent}>
      <div className="flex flex-col gap-1 px-1.5 pb-1.5">
        <div style={{ width: CHART_WIDTH, height: CHART_HEIGHT_PX, margin: '0 auto' }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
            <ComposedChart data={points} margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
              <CartesianGrid
                vertical={false}
                stroke={GRID_STROKE}
                horizontalCoordinatesGenerator={({ height, offset }) => {
                  const plotTop = offset?.top ?? 0;
                  const plotHeight = height - plotTop - (offset?.bottom ?? 0);
                  return GRID_LINE_FRACTIONS.map((fraction) => plotTop + plotHeight * fraction);
                }}
              />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                interval={0}
                tick={({ x, y, payload }) => {
                  const isTodayTick = points.find((point) => point.day === String(payload.value))?.date === todayKey;
                  return (
                    <g transform={`translate(${x},${y})`}>
                      {isTodayTick && <rect x={-TODAY_TAG.width / 2} y={0} width={TODAY_TAG.width} height={TODAY_TAG.height} fill={TASK_COLOR} />}
                      <text x={0} y={TICK_FONT_PX} textAnchor="middle" fill={isTodayTick ? '#000' : 'var(--fg-muted)'} fontSize={TICK_FONT_PX} fontWeight={isTodayTick ? 600 : 400}>
                        {payload.value}
                      </text>
                    </g>
                  );
                }}
              />
              <YAxis yAxisId="left" hide />
              <YAxis yAxisId="right" orientation="right" hide />
              <YAxis yAxisId="right2" orientation="right" hide />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const count = payload.find((item) => item.dataKey === 'count')?.value;
                  const sessionMins = payload.find((item) => item.dataKey === 'sessionMins')?.value as number | undefined;
                  const eventMins = payload.find((item) => item.dataKey === 'eventMins')?.value as number | undefined;
                  return (
                    <div className="flex flex-col gap-0.5 border px-2.5 py-1 text-fg-prominent" style={{ background: '#0d0d0d', borderColor: 'rgba(255,255,255,0.15)', fontSize: '0.78rem' }}>
                      <span>{label} · <span style={{ color: TASK_COLOR }}>{count} tasks</span></span>
                      {sessionMins != null && sessionMins > 0 && <span style={{ color: SESSION_COLOR }}>{formatMinutes(sessionMins)} session</span>}
                      {eventMins != null && eventMins > 0 && <span style={{ color: EVENT_MINUTES_COLOR }}>{formatMinutes(eventMins)} events</span>}
                    </div>
                  );
                }}
              />
              <Bar yAxisId="left" dataKey="count" fill={BAR_FILL} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="sessionMins" stroke={SESSION_COLOR} strokeWidth={1.5} dot={dotFor('#fff', 'rgba(245,200,66,0.6)')} activeDot={{ r: 4, fill: SESSION_COLOR, stroke: 'none' }} />
              <Line yAxisId="right2" type="monotone" dataKey="eventMins" stroke={EVENT_MINUTES_COLOR} strokeWidth={1.5} dot={dotFor(SESSION_COLOR, 'rgba(192,132,252,0.6)')} activeDot={{ r: 4, fill: EVENT_MINUTES_COLOR, stroke: 'none' }} />
              <Line yAxisId="left" type="monotone" dataKey="count" stroke={TASK_COLOR} strokeWidth={2.5} dot={dotFor(SESSION_COLOR, 'rgba(255,255,255,0.5)')} activeDot={{ r: 4, fill: '#ffffff', stroke: 'none' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </SidebarPacket>
  );
}
