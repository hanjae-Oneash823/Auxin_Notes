import type { SessionNode, WorkSession } from '../db/queries/planner/types';
import { formatDuration, sessionSpanMinutes } from './sessionClock';

/** Mycelium's session-length buckets (hours): a session lands in the first bucket whose upper bound it fits. */
const BUCKETS = ['0-1', '1-2', '2-3', '3-4', '4-5', '5-6', '6+'] as const;
const ACCENT = '#00c4a7';
const UNTRACKED_COLOR = '#666666';
const UNTRACKED_NAME = 'untracked';

const bucketIndex = (minutes: number) => Math.min(BUCKETS.length - 1, Math.max(0, Math.ceil(minutes / 60) - 1));

interface ArcRow { name: string; color: string; minutes: number; nodeIds: Set<string> }

function Heading({ children }: { children: string }) {
  return <h4 className="uppercase tracking-wider text-fg-faint" style={{ fontSize: '0.68rem' }}>{children}</h4>;
}

function Bar({ fraction, color }: { fraction: number; color: string }) {
  return (
    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-row bg-border-subtle">
      <div className="h-full" style={{ width: `${Math.max(2, fraction * 100)}%`, background: color }} />
    </div>
  );
}

/** Session analytics from Mycelium's On The Clock panel: by-location rank,
 *  arc time breakdown and a session-length histogram. */
export function SessionAnalytics({ sessions, sessionNodes }: { sessions: readonly WorkSession[]; sessionNodes: readonly SessionNode[] }) {
  const timed = sessions.flatMap((session) => {
    const minutes = sessionSpanMinutes(session);
    return minutes === null ? [] : [{ session, minutes }];
  });

  const locationTotals = [...timed.reduce((totals, { session, minutes }) => {
    const name = session.locationName ?? '—';
    return totals.set(name, (totals.get(name) ?? 0) + minutes);
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const maxLocation = locationTotals[0]?.[1] || 1;

  const arcRows = sessionNodes.reduce((rows, node) => {
    if (!node.totalMinutes || node.totalMinutes <= 0) return rows;
    const name = node.arcName ?? UNTRACKED_NAME;
    const row = rows.get(name) ?? { name, color: node.arcColor ?? UNTRACKED_COLOR, minutes: 0, nodeIds: new Set<string>() };
    row.minutes += node.totalMinutes;
    row.nodeIds.add(node.nodeId);
    return rows.set(name, row);
  }, new Map<string, ArcRow>());
  const arcs = [...arcRows.values()].sort((a, b) => b.minutes - a.minutes);
  const maxArc = arcs[0]?.minutes || 1;

  const counts = BUCKETS.map((_, index) => timed.filter(({ minutes }) => bucketIndex(minutes) === index).length);
  const maxCount = Math.max(1, ...counts);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <Heading>by location</Heading>
        {locationTotals.length === 0 && <span className="text-fg-faint">no finished sessions yet</span>}
        {locationTotals.map(([name, minutes]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="w-20 shrink-0 truncate text-fg-muted">{name}</span>
            <Bar fraction={minutes / maxLocation} color={ACCENT} />
            <span className="w-16 shrink-0 text-right text-fg-faint" style={{ fontSize: '0.72rem' }}>{formatDuration(minutes)}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <Heading>time by arc</Heading>
        {arcs.map((arc) => (
          <div key={arc.name} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate" style={{ color: arc.color }}>{arc.name}</span>
            <Bar fraction={arc.minutes / maxArc} color={arc.color} />
            <span className="w-24 shrink-0 text-right text-fg-faint" style={{ fontSize: '0.72rem' }}>{formatDuration(arc.minutes)} · {arc.nodeIds.size}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <Heading>session length (hours)</Heading>
        <div className="flex h-20 items-end gap-1.5">
          {BUCKETS.map((label, index) => (
            <div key={label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="w-full rounded-row" style={{ height: `${(counts[index] / maxCount) * 100}%`, minHeight: counts[index] ? 4 : 0, background: ACCENT }} />
              <span className="text-fg-faint" style={{ fontSize: '0.65rem' }}>{label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
