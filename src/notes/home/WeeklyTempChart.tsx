import { useState, type ReactNode } from 'react';
import { useElementWidth } from '../../layout/useElementWidth';
import { TODAY_INDEX } from './weatherApi';

export const WEATHER_FONT = 'var(--font-family)';
export const HIGH_COLOR = '#fb923c';
export const LOW_COLOR = '#60a5fa';

const DEFAULT_WIDTH = 220;
const PLOT_HEIGHT = 56;
const PAD = 10;
/** Room above the plot for the header overlay (city, temperature, condition). */
const HEADER_INSET = 62;
const STROKE_WIDTH = 1.5;
const DOT_RADIUS = 2.6;
const DOT_RADIUS_TODAY = 3.6;
const DOT_RADIUS_HOVERED = 4.6;
/** Muted at rest so the chart sits quietly among Home's neutral text. */
const SERIES_OPACITY = 0.7;

interface WeeklyTempChartProps {
  dates: string[];
  highs: number[];
  lows: number[];
  /** Pinned to the chart's top-left, above the plotted lines. */
  header?: ReactNode;
}

const dayAbbrev = (dateStr: string) =>
  new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' });

const dayFull = (dateStr: string) =>
  new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** Seven-day high/low lines that stretch to the column's width, with hover
 *  tooltips. Index 0 is yesterday and `TODAY_INDEX` is today, which gets the
 *  larger dot and the filled weekday letter. */
export function WeeklyTempChart({ dates, highs, lows, header }: WeeklyTempChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>(DEFAULT_WIDTH);
  const [hovered, setHovered] = useState<number | null>(null);

  if (dates.length < 2 || highs.length !== dates.length || lows.length !== dates.length) return null;

  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = Math.max(1, max - min);
  const height = HEADER_INSET + PLOT_HEIGHT + PAD;
  const stepX = (width - PAD * 2) / (dates.length - 1);
  const xFor = (i: number) => PAD + i * stepX;
  const yFor = (v: number) => HEADER_INSET + (1 - (v - min) / span) * PLOT_HEIGHT;
  const pointsFor = (values: number[]) => values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
  const radiusFor = (i: number) => (i === hovered ? DOT_RADIUS_HOVERED : i === TODAY_INDEX ? DOT_RADIUS_TODAY : DOT_RADIUS);
  const opacityFor = (i: number) => (i === hovered ? 1 : SERIES_OPACITY);
  const tooltipShift = hovered === 0 ? '0%' : hovered === dates.length - 1 ? '-100%' : '-50%';
  const series = [
    { values: highs, color: HIGH_COLOR, key: 'h' },
    { values: lows, color: LOW_COLOR, key: 'l' },
  ];

  return (
    <div ref={ref} className="flex w-full flex-col gap-1" style={{ fontFamily: WEATHER_FONT }}>
      <div className="relative">
        {header && <div className="absolute left-0 top-0">{header}</div>}
        <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
          {series.map(({ values, color, key }) => (
            <polyline
              key={key}
              points={pointsFor(values)}
              fill="none"
              stroke={color}
              strokeOpacity={SERIES_OPACITY}
              strokeWidth={STROKE_WIDTH}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {hovered !== null && (
            <line
              x1={xFor(hovered)}
              x2={xFor(hovered)}
              y1={HEADER_INSET}
              y2={height - PAD}
              stroke="var(--fg-faint)"
              strokeWidth={1}
            />
          )}

          {series.map(({ values, color, key }) =>
            values.map((v, i) => (
              <circle
                key={`${key}${dates[i]}`}
                cx={xFor(i)}
                cy={yFor(v)}
                r={radiusFor(i)}
                fill={color}
                fillOpacity={opacityFor(i)}
              />
            )),
          )}

          {dates.map((date, i) => (
            <rect
              key={`hit${date}`}
              x={xFor(i) - stepX / 2}
              y={HEADER_INSET - PAD}
              width={stepX}
              height={PLOT_HEIGHT + PAD * 2}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((current) => (current === i ? null : current))}
            />
          ))}
        </svg>

        {hovered !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 whitespace-nowrap border text-fg-prominent"
            style={{
              left: xFor(hovered),
              top: HEADER_INSET - PAD,
              transform: `translate(${tooltipShift}, -100%)`,
              background: 'var(--color-bg)',
              borderColor: 'var(--fg-faint)',
              fontSize: '0.78rem',
              padding: '4px 10px',
            }}
          >
            <div className="text-fg-muted">{dayFull(dates[hovered])}</div>
            <div>
              <span style={{ color: HIGH_COLOR }}>H {Math.round(highs[hovered])}°C</span>
              {'  '}
              <span style={{ color: LOW_COLOR }}>L {Math.round(lows[hovered])}°C</span>
            </div>
          </div>
        )}
      </div>

      <div className="relative" style={{ width, height: 20 }}>
        {dates.map((date, i) => {
          const isToday = i === TODAY_INDEX;
          const isHovered = i === hovered;
          return (
            <span
              key={date}
              className="absolute top-0 inline-flex items-center justify-center"
              style={{
                left: xFor(i),
                transform: 'translateX(-50%)',
                width: isToday ? 20 : undefined,
                height: isToday ? 20 : undefined,
                background: isToday ? 'var(--fg-prominent)' : 'transparent',
                fontSize: '0.78rem',
                fontWeight: isToday || isHovered ? 'bold' : 'normal',
                color: isToday ? 'var(--color-bg)' : isHovered ? 'var(--fg-prominent)' : 'var(--fg-muted)',
              }}
            >
              {dayAbbrev(date)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
