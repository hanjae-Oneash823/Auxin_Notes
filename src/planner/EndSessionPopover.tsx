import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatClock, resolveEndTime } from './sessionClock';

const MINUTE_MS = 60_000;
const VIEWPORT_MARGIN = 8;
const QUICK_PICKS = [
  { label: '15 min ago', minutesAgo: 15 },
  { label: '1 hour ago', minutesAgo: 60 },
];

interface EndSessionPopoverProps {
  x: number;
  /** Top edge when opened below the anchor. */
  y: number;
  /** Bottom edge when flipped above the anchor (no room below). */
  yAbove: number;
  startIso: string;
  /** Latest recorded work in the session, as a suggested stop time. */
  lastActivityMs: number | null;
  /** Ends the session now (no argument) or at the given past ISO instant. */
  onEnd: (endTime?: string) => void;
  onClose: () => void;
}

const ROW = 'block w-full rounded-row px-2 py-1.5 text-left text-fg-muted transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent';

/** "Stop at…" for a session that was left running: quick picks, the last
 *  recorded activity, or a typed clock time (its most recent occurrence). */
export function EndSessionPopover({ x, y, yAbove, startIso, lastActivityMs, onEnd, onClose }: EndSessionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [nowMs] = useState(Date.now);
  const [time, setTime] = useState(() => formatClock(new Date(nowMs).toISOString()));
  const startMs = Date.parse(startIso);
  const [top, setTop] = useState(y);

  // Measured after layout: if the popover would run off the window bottom,
  // open it above the anchor instead.
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    setTop(y + height > window.innerHeight - VIEWPORT_MARGIN ? Math.max(VIEWPORT_MARGIN, yAbove - height) : y);
  }, [y, yAbove]);
  const resolved = resolveEndTime(time, startIso, nowMs);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  const endAt = (ms: number) => onEnd(new Date(ms).toISOString());
  const picks = [
    ...(lastActivityMs !== null && lastActivityMs > startMs
      ? [{ label: `Last activity · ${formatClock(new Date(lastActivityMs).toISOString())}`, ms: lastActivityMs }]
      : []),
    ...QUICK_PICKS.map((pick) => ({ label: pick.label, ms: nowMs - pick.minutesAgo * MINUTE_MS })).filter((pick) => pick.ms > startMs),
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 w-[220px] border border-border bg-bg p-1.5"
      style={{ left: Math.max(4, Math.min(x, window.innerWidth - 228)), top, fontSize: '0.8rem' }}
    >
      <button type="button" className={`${ROW} font-semibold text-fg-prominent`} onClick={() => onEnd()}>End now</button>
      {picks.map((pick) => (
        <button key={pick.label} type="button" className={ROW} onClick={() => endAt(pick.ms)}>{pick.label}</button>
      ))}
      <form
        className="mt-1 flex flex-col gap-1 border-t border-border-subtle px-1 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (resolved.isValid) onEnd(resolved.iso);
        }}
      >
        <span className="text-fg-faint" style={{ fontSize: '0.68rem' }}>I actually stopped at</span>
        <div className="flex items-center gap-1.5">
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="min-w-0 flex-1 rounded-row border border-border-subtle bg-transparent px-1.5 py-1 text-fg-prominent"
          />
          <button type="submit" disabled={!resolved.isValid} className="rounded-row px-2 py-1 text-fg-prominent enabled:hover:bg-border-subtle disabled:opacity-40">
            End
          </button>
        </div>
        <span className={resolved.isValid ? 'text-fg-faint' : 'text-accent-warning'} style={{ fontSize: '0.68rem' }}>
          {resolved.isValid
            ? new Date(resolved.iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
            : resolved.error}
        </span>
      </form>
    </div>
  );
}
