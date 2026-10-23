import { useMemo, type ReactNode } from 'react';
import type { Arc, PlannerNode } from '../db/queries/planner/types';
import { tally } from './arcDerived';
import { FLOW_WEEKS, SHARE_DAYS, openTrend, timeShare, weeklyFlow } from './arcFlow';
import { todayKey } from './nodeDerived';
import { useSessionStore } from './sessionStore';
import { Sparkline } from './Sparkline';

const MINUTES_PER_HOUR = 60;
const GRAPHIC_H_PX = 44;

/** Session minutes are fractional, so round to whole minutes first. */
function formatMinutes(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes);
  return minutes >= MINUTES_PER_HOUR ? `${Math.floor(minutes / MINUTES_PER_HOUR)}h ${minutes % MINUTES_PER_HOUR}m` : `${minutes}m`;
}

function Stat({ label, figure, graphic, caption, isWide = false }: { label: string; figure: string | number; graphic: ReactNode; caption: string; isWide?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-2" style={isWide ? { gridColumn: 'span 2' } : undefined}>
      <span className="uppercase tracking-wider text-fg-faint" style={{ fontSize: '0.66rem' }}>{label}</span>
      <span className="font-mono leading-none tabular-nums text-fg-prominent" style={{ fontSize: '1.75rem' }}>{figure}</span>
      <div className="flex items-center" style={{ height: GRAPHIC_H_PX }}>{graphic}</div>
      <span className="truncate font-mono text-fg-faint" style={{ fontSize: '0.7rem' }}>{caption}</span>
    </div>
  );
}

/** An arc's numbers as a strip of stats: each is a label, a big figure, a word-sized graphic and a caption (small multiples; done and added share a scale). */
export function ArcAnalytics({ arc, nodes }: { arc: Arc; nodes: readonly PlannerNode[] }) {
  const sessionNodes = useSessionStore((state) => state.sessionNodes);
  const counts = useMemo(() => tally(nodes, (node) => node.arcId === arc.id), [nodes, arc.id]);
  const flow = useMemo(() => weeklyFlow(nodes, arc.id, todayKey()), [nodes, arc.id]);
  const share = useMemo(() => timeShare(sessionNodes, arc.id, new Date()), [sessionNodes, arc.id]);

  const added = flow.map((week) => week.created);
  const done = flow.map((week) => week.done);
  const open = openTrend(flow, counts.open);
  const openChange = open[open.length - 1] - open[0];
  const thisWeek = flow[flow.length - 1];
  const span = `last ${FLOW_WEEKS} weeks`;


  return (
    <div className="grid gap-x-6 gap-y-5 border-t border-border-subtle pt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))' }}>
      <Stat
        label="done / added"
        isWide
        figure={`${counts.done} / ${counts.total}`}
        caption={`${thisWeek.done} done · ${thisWeek.created} added this week`}
        graphic={<Sparkline series={[{ values: done, color: arc.colorHex }, { values: added, color: 'var(--fg-muted)', isDashed: true }]} height={GRAPHIC_H_PX} label={`Tasks finished (solid) and added (dashed) per week, ${span}`} />}
      />
      <Stat label="open" figure={counts.open} caption={openChange === 0 ? 'no change' : `${openChange > 0 ? '+' : '−'}${Math.abs(openChange)} over ${FLOW_WEEKS} wks`} graphic={<Sparkline series={[{ values: open, color: 'var(--fg-muted)' }]} height={GRAPHIC_H_PX} label={`Open tasks at the end of each week, ${span}`} />} />
      {share.totalMinutes > 0 && (
        <Stat
          label="your time"
          figure={`${Math.round(share.share * 100)}%`}
          caption={`${formatMinutes(share.arcMinutes)} in ${SHARE_DAYS} days`}
          graphic={
            <span role="img" aria-label="Share of session time" className="block h-1 w-full overflow-hidden rounded-full bg-border-subtle">
              <span className="block h-full rounded-full" style={{ width: `${share.share * 100}%`, background: 'var(--fg-muted)' }} />
            </span>
          }
        />
      )}
    </div>
  );
}
