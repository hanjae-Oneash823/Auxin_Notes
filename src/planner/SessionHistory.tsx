import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import type { SessionNode, SessionNodeStatus, SessionStatus, WorkSession } from '../db/queries/planner/types';
import { SessionAnalytics } from './SessionAnalytics';
import { COLLAPSE, POP_IN } from './plannerMotion';
import { usePlannerStore } from './plannerStore';
import { formatClock, formatDuration, formatSessionDate, formatTimer, sessionElapsedMs, sessionSpanMinutes } from './sessionClock';
import { selectActiveSession, useSessionStore } from './sessionStore';
import { bucketNodes, poolNodes } from './hotLogic';

const SESSION_YELLOW = '#f5c842';
const PAUSE_BLUE = '#0055ff';
const PAGE_SIZE = 40;
const CANDIDATE_LIMIT = 12;

/** Mycelium's STATUS_COLOR. */
const STATUS_COLOR: Record<SessionStatus, string> = {
  planned: '#8a8a8a', active: '#f59e0b', paused: '#60a5fa', completed: '#4ade80', interrupted: '#f87171',
};
const NODE_SYMBOL: Record<SessionNodeStatus, { symbol: string; color: string }> = {
  done: { symbol: '✓', color: '#4ade80' },
  incomplete: { symbol: '✗', color: '#f87171' },
  in_progress: { symbol: '▸', color: SESSION_YELLOW },
  queued: { symbol: '○', color: '#888' },
};
const UNTRACKED_COLOR = '#888888';

const LINK_BUTTON = 'text-fg-faint hover:text-fg-prominent';

function Heading({ children }: { children: string }) {
  return <h3 className="font-semibold uppercase tracking-wider text-fg-prominent" style={{ fontSize: '0.8rem' }}>{children}</h3>;
}

/** Mycelium's active-session strip: status, location, title, timer, pause/end. */
function ActiveStrip({ session, elapsedMs }: { session: WorkSession; elapsedMs: number }) {
  const { pause, resume, end } = useSessionStore();
  const isPaused = session.status === 'paused';
  const buttonClass = 'rounded-tab border border-black/30 px-2.5 py-0.5 uppercase tracking-wide hover:bg-black/10';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-tab px-4 py-2" style={{ background: SESSION_YELLOW, color: isPaused ? PAUSE_BLUE : '#000' }}>
      <span className="font-semibold uppercase tracking-widest">{isPaused ? '⏸ paused' : '● active'}</span>
      {session.locationName && <span style={{ color: PAUSE_BLUE }}>@{session.locationName}</span>}
      <span className="min-w-0 flex-1 truncate text-black/55">{session.title}</span>
      <span className="font-semibold tabular-nums" style={{ fontSize: '1.1rem' }}>{formatTimer(elapsedMs)}</span>
      <button type="button" onClick={() => void (isPaused ? resume() : pause())} className={buttonClass}>{isPaused ? 'resume' : 'pause'}</button>
      <button type="button" onClick={() => void end('completed')} className={buttonClass}>end</button>
      <button type="button" onClick={() => void end('interrupted')} className={buttonClass} title="end as interrupted">stop</button>
    </div>
  );
}

/** The live session's node queue: start / finish / skip nodes and pull more in from Hot. */
function SessionQueue({ session }: { session: WorkSession }) {
  const { sessionNodes, addNodes, startNode, finishNode, markIncomplete, returnToQueue, removeNode } = useSessionStore();
  const nodes = usePlannerStore((state) => state.nodes);
  const mine = sessionNodes.filter((node) => node.sessionId === session.id);
  const taken = new Set(mine.map((node) => node.nodeId));
  const { hot } = bucketNodes(nodes);
  const candidates = [...poolNodes(nodes, 'grill'), ...hot].filter((node) => !taken.has(node.id) && node.nodeType !== 'event').slice(0, CANDIDATE_LIMIT);

  const action = (label: string, run: () => Promise<void>) => (
    <button key={label} type="button" onClick={() => void run()} className={LINK_BUTTON} style={{ fontSize: '0.72rem' }}>[{label}]</button>
  );

  return (
    <section className="flex flex-col gap-1.5 rounded-tab border border-border-subtle px-3 py-2.5">
      <Heading>in session</Heading>
      {mine.length === 0 && <span className="text-fg-faint">Add nodes from Hot to work through them.</span>}
      <AnimatePresence initial={false}>
      {mine.map((node) => {
        const { symbol, color } = NODE_SYMBOL[node.status];
        return (
          <motion.div key={node.nodeId} {...COLLAPSE} className="flex items-baseline gap-2">
            <motion.span key={node.status} {...POP_IN} className="w-3 shrink-0" style={{ color }}>{symbol}</motion.span>
            <span className="min-w-0 flex-1 truncate" style={{ color: node.arcColor ?? UNTRACKED_COLOR }}>{node.title}</span>
            {node.status === 'queued' && [
              action('start', () => startNode(session.id, node.nodeId)),
              action('×', () => removeNode(session.id, node.nodeId)),
            ]}
            {node.status === 'in_progress' && [
              action('done', () => finishNode(session.id, node.nodeId)),
              action('skip', () => markIncomplete(session.id, node.nodeId)),
              action('back', () => returnToQueue(session.id, node.nodeId)),
            ]}
          </motion.div>
        );
      })}
      </AnimatePresence>
      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <AnimatePresence initial={false} mode="popLayout">
          {candidates.map((node) => (
            <motion.button
              key={node.id}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              type="button"
              onClick={() => void addNodes(session.id, [node.id])}
              className="max-w-[16rem] truncate rounded-tab border border-border-subtle px-2 py-0.5 text-fg-muted hover:border-border-strong hover:text-fg-prominent"
              style={{ fontSize: '0.74rem' }}
            >
              + {node.title}
            </motion.button>
          ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function StartSession() {
  const { locations, start, addLocation, removeLocation } = useSessionStore();
  const [locationId, setLocationId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const selected = locations.find((location) => location.id === locationId);

  function submitLocation() {
    const name = draft.trim();
    if (!name) return;
    void addLocation(name);
    setDraft('');
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {locations.length === 0 && <span className="text-fg-faint">no locations — edit the list to add one</span>}
        {locations.map((location, index) => (
          <span key={location.id} className="flex items-center gap-2">
            {index > 0 && <span className="text-fg-faint">·</span>}
            <button
              type="button"
              onClick={() => (isEditing ? void removeLocation(location.id) : setLocationId(locationId === location.id ? null : location.id))}
              className={`transition-colors duration-panel ease-panel ${isEditing ? 'text-fg-muted hover:text-accent-link-broken' : locationId === location.id ? 'text-accent-warning' : 'text-fg-muted hover:text-fg-prominent'}`}
              title={isEditing ? 'remove location' : undefined}
            >
              {location.name}{isEditing ? ' ×' : ''}
            </button>
          </span>
        ))}
        <button type="button" onClick={() => setIsEditing((value) => !value)} className={`${LINK_BUTTON} ml-auto`} style={{ fontSize: '0.72rem' }}>{isEditing ? 'done' : 'edit list'}</button>
      </div>
      {isEditing && (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && submitLocation()}
          placeholder="New location — press Enter"
          className="rounded-tab border border-border-subtle bg-bg-packet px-2.5 py-1.5 text-fg-prominent outline-none placeholder:text-fg-faint focus:border-border-strong"
        />
      )}
      <button
        type="button"
        disabled={!selected}
        onClick={() => { if (selected) { void start(selected.id); setLocationId(null); } }}
        className="rounded-tab border border-border-subtle px-3 py-1.5 text-fg-muted transition-colors duration-panel ease-panel enabled:hover:border-border-strong enabled:hover:text-accent-warning disabled:opacity-40"
      >
        {selected ? `start @${selected.name}` : 'start session'}
      </button>
    </div>
  );
}

/** One session in Mycelium's `$ title ---- STATUS` log format. */
function LogEntry({ session, nodes }: { session: WorkSession; nodes: readonly SessionNode[] }) {
  const remove = useSessionStore((state) => state.remove);
  const [isConfirming, setIsConfirming] = useState(false);
  const color = STATUS_COLOR[session.status];
  const minutes = sessionSpanMinutes(session);
  const doneCount = nodes.filter((node) => node.status === 'done').length;

  return (
    <div className="flex flex-col gap-1 rounded-tab border border-border-subtle px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-fg-prominent">$</span>
        <span className="shrink-0" style={{ color }}>{session.title}</span>
        <span className="relative -top-0.5 flex-1 border-b border-dashed border-border-default" />
        <span className="shrink-0 uppercase tracking-widest" style={{ color, fontSize: '0.75rem' }}>{session.status}</span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 pl-4 text-fg-muted" style={{ fontSize: '0.78rem' }}>
        <span className="text-fg-faint">time</span>
        <span>{session.actualStart ? `${formatClock(session.actualStart)} → ${formatClock(session.actualEnd)}${minutes !== null ? `  (${formatDuration(minutes)})` : ''}` : 'not started'}</span>
        <span className="text-fg-faint">· where</span>
        <span>{session.locationName ? `@ ${session.locationName}` : '—'} · {formatSessionDate(session.plannedDate)}</span>
        <span className="flex-1" />
        {nodes.length > 0 && <span className="text-fg-prominent">{doneCount} / {nodes.length} done</span>}
      </div>

      <div className="flex flex-col pl-4">
        {nodes.length === 0 && <span className="text-fg-faint" style={{ fontSize: '0.78rem' }}>no nodes</span>}
        {nodes.map((node) => {
          const { symbol, color: symbolColor } = NODE_SYMBOL[node.status];
          return (
            <div key={node.nodeId} className="flex items-baseline gap-2" style={{ fontSize: '0.82rem' }}>
              <span className="w-3 shrink-0" style={{ color: symbolColor }}>{symbol}</span>
              <span className="min-w-0 flex-1 truncate" style={{ color: node.arcColor ?? UNTRACKED_COLOR, opacity: node.status === 'done' ? 0.6 : 1 }}>{node.title}</span>
              <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.72rem' }}>{node.totalMinutes === null ? '—' : node.totalMinutes < 1 ? '<1m' : `${Math.round(node.totalMinutes)}m`}</span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => (isConfirming ? void remove(session.id) : setIsConfirming(true))}
        onMouseLeave={() => setIsConfirming(false)}
        className={`self-start pl-4 transition-colors duration-panel ease-panel ${isConfirming ? 'text-accent-link-broken' : 'text-fg-faint hover:text-fg-muted'}`}
        style={{ fontSize: '0.72rem' }}
      >
        {isConfirming ? 'confirm? [click]' : 'rm session'}
      </button>
    </div>
  );
}

/** On The Clock: the live session (strip + node queue), the start-session builder, the log and analytics. */
export function SessionHistory() {
  const { sessions, sessionNodes, activePauses } = useSessionStore();
  const active = selectActiveSession({ sessions });
  const [nowMs, setNowMs] = useState(Date.now);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const isTicking = active?.status === 'active';

  useEffect(() => {
    if (!isTicking) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isTicking]);

  const nodesBySession = useMemo(() => {
    const grouped = new Map<string, SessionNode[]>();
    for (const node of sessionNodes) grouped.set(node.sessionId, [...(grouped.get(node.sessionId) ?? []), node]);
    return grouped;
  }, [sessionNodes]);

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex flex-col gap-5">
      <AnimatePresence initial={false}>
        {active && (
          <motion.div key="live" {...COLLAPSE}>
            <div className="flex flex-col gap-5 pb-5">
              <ActiveStrip session={active} elapsedMs={sessionElapsedMs(active, activePauses, nowMs)} />
              <SessionQueue session={active} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-[320px] flex-[2] flex-col gap-2">
          <Heading>session log</Heading>
          {sessions.length === 0 && <p className="text-fg-faint">no sessions yet</p>}
          {sessions.slice(0, visibleCount).map((session) => (
            <LogEntry key={session.id} session={session} nodes={nodesBySession.get(session.id) ?? []} />
          ))}
          {sessions.length > visibleCount && (
            <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="self-start text-fg-muted hover:text-fg-prominent">
              show more ({sessions.length - visibleCount} older)
            </button>
          )}
        </section>

        <div className="flex min-w-[260px] flex-1 flex-col gap-6">
          <AnimatePresence initial={false}>
            {!active && (
              <motion.div key="start" {...COLLAPSE}>
                <section className="flex flex-col gap-3 pb-6">
                  <Heading>start session</Heading>
                  <StartSession />
                </section>
              </motion.div>
            )}
          </AnimatePresence>
          <section className="flex flex-col gap-3">
            <Heading>analytics</Heading>
            <SessionAnalytics sessions={sessions} sessionNodes={sessionNodes} />
          </section>
        </div>
      </div>
    </div>
    </MotionConfig>
  );
}
