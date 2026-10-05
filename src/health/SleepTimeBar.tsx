import { useRef, useState } from 'react';
import { barSpanLabel, hourToPos, posToHHMM, snapPos } from './sleepTime';

export interface BarSelection {
  /** 0–1 positions along the bar, start < end. */
  start: number;
  end: number;
}

interface SleepTimeBarProps {
  value: BarSelection | null;
  onChange: (selection: BarSelection | null) => void;
}

const TICK_HOURS = [22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const LABELED_HOURS = new Set([22, 0, 3, 6, 9, 12]);
/** Narrower than this (a stray click) isn't a night. */
const MIN_SELECTION = 0.005;
const SELECTION_COLOR = '#facc15';

/** The 22:00–12:00 strip: drag across it to mark when you fell asleep and woke. */
export function SleepTimeBar({ value, onChange }: SleepTimeBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  function rawPos(clientX: number): number {
    const rect = barRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
  }

  function select(toPos: number) {
    const anchor = anchorRef.current;
    if (anchor === null) return;
    const start = Math.min(anchor, toPos);
    const end = Math.max(anchor, toPos);
    onChange(end - start > MIN_SELECTION ? { start, end } : null);
  }

  return (
    <div className="flex select-none flex-col gap-1.5">
      <div className="relative pt-6">
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-tab border border-border bg-bg px-1.5 text-fg-prominent"
            style={{ left: `${hover * 100}%`, fontSize: '0.78rem' }}
          >
            {posToHHMM(hover)}
          </div>
        )}
        <div
          ref={barRef}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            anchorRef.current = snapPos(rawPos(event.clientX));
            select(anchorRef.current);
          }}
          onPointerMove={(event) => {
            setHover(snapPos(rawPos(event.clientX)));
            if (anchorRef.current !== null) select(snapPos(rawPos(event.clientX)));
          }}
          onPointerUp={() => { anchorRef.current = null; }}
          onPointerCancel={() => { anchorRef.current = null; }}
          onPointerLeave={() => setHover(null)}
          className="relative h-7 cursor-crosshair rounded-tab border border-border-subtle bg-border-subtle"
          style={{ touchAction: 'none' }}
        >
          {TICK_HOURS.map((hour) => (
            <span
              key={hour}
              className="pointer-events-none absolute top-0 w-px bg-fg-faint"
              style={{ left: `${hourToPos(hour) * 100}%`, height: LABELED_HOURS.has(hour) ? '100%' : '40%', opacity: LABELED_HOURS.has(hour) ? 0.5 : 0.25 }}
            />
          ))}
          {value && (
            <span
              className="pointer-events-none absolute inset-y-0"
              style={{
                left: `${value.start * 100}%`,
                width: `${(value.end - value.start) * 100}%`,
                background: `color-mix(in srgb, ${SELECTION_COLOR} 20%, transparent)`,
                borderInline: `2px solid ${SELECTION_COLOR}`,
              }}
            />
          )}
          {hover !== null && <span className="pointer-events-none absolute inset-y-0 w-px bg-fg-muted" style={{ left: `${hover * 100}%` }} />}
        </div>
      </div>

      <div className="relative h-4 text-fg-muted" style={{ fontSize: '0.72rem' }}>
        {TICK_HOURS.filter((hour) => LABELED_HOURS.has(hour)).map((hour) => (
          <span key={hour} className="absolute -translate-x-1/2" style={{ left: `${hourToPos(hour) * 100}%` }}>{String(hour).padStart(2, '0')}</span>
        ))}
      </div>

      <div className="flex min-h-6 justify-end text-fg-faint" style={{ fontSize: '1rem' }}>
        {value ? (
          <span>
            <span style={{ color: SELECTION_COLOR }}>{posToHHMM(value.start)}</span>
            <span> → </span>
            <span style={{ color: SELECTION_COLOR }}>{posToHHMM(value.end)}</span>
            <span className="ml-2.5 text-fg-muted">[{barSpanLabel(value.start, value.end)}]</span>
          </span>
        ) : (
          'drag to select'
        )}
      </div>
    </div>
  );
}
