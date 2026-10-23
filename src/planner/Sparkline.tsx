import { useEffect, useRef, useState } from 'react';

export interface SparkSeries {
  values: readonly number[];
  color: string;
  /** Drawn thinner and dashed, as the secondary line. */
  isDashed?: boolean;
}

interface SparklineProps {
  /** One or more lines sharing a scale; the first is drawn on top. */
  series: readonly SparkSeries[];
  height?: number;
  label: string;
}

const PAD_PX = 3;
const LINE_PX = 1.5;
const END_DOT_PX = 2.5;
const FALLBACK_WIDTH_PX = 120;

/** A word-sized line graphic (Tufte's sparkline): no axes, no frame, a dot on each line's latest value. It fills its container's width. */
export function Sparkline({ series, height = 28, label }: SparklineProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH_PX);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, Math.round(entry.contentRect.width))));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const top = Math.max(1, ...series.flatMap((line) => line.values));
  const x = (index: number, count: number) => PAD_PX + (index * (width - 2 * PAD_PX)) / Math.max(1, count - 1);
  const y = (value: number) => height - PAD_PX - (value / top) * (height - 2 * PAD_PX);
  // Back to front, so the first series ends up on top.
  const drawn = [...series].reverse();
  return (
    <div ref={rootRef} className="w-full" style={{ height }}>
      <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible">
        <title>{label}</title>
        {drawn.map((line, lineIndex) => {
          const last = line.values.length - 1;
          return (
            <g key={lineIndex}>
              <polyline
                points={line.values.map((value, index) => `${x(index, line.values.length).toFixed(1)},${y(value).toFixed(1)}`).join(' ')}
                fill="none"
                stroke={line.color}
                strokeWidth={line.isDashed ? LINE_PX - 0.25 : LINE_PX}
                strokeDasharray={line.isDashed ? '3 3' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.9}
              />
              <circle cx={x(last, line.values.length)} cy={y(line.values[last])} r={END_DOT_PX} fill={line.color} />
              <circle className="spark-ping" cx={x(last, line.values.length)} cy={y(line.values[last])} r={END_DOT_PX} fill="none" stroke={line.color} strokeWidth={1} style={{ animationDelay: `${lineIndex * 0.9}s` }} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
