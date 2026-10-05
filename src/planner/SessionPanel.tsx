import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { CaretDown, Check, Pause, Play, SkipForward, Stop, Timer } from '@phosphor-icons/react';
import { ContextMenu, type ContextMenuItem } from '../layout/ContextMenu';
import { PacketIconButton } from '../layout/SidebarPacket';
import { COLLAPSE, PANEL_EASE, PANEL_TRANSITION } from './plannerMotion';
import { EndSessionPopover } from './EndSessionPopover';
import { formatDuration, formatTimer, lastActivityMs, LONG_SESSION_MS, sessionElapsedMs } from './sessionClock';
import { NO_ARC_COLOR } from '../clock/clockBlocks';
import { selectActiveSession, useSessionStore } from './sessionStore';

const TICK_MS = 1000;
const RUNNING_COLOR = 'var(--accent-status-dot)';
const PAUSED_COLOR = 'var(--accent-warning)';

/** The Planner area's session controls: a location picker and Start button
 *  when idle, and the live session's title, timer, node progress, pause and
 *  stop once started. Shares its state with the On the clock tab. */
function SessionPanelBody() {
  const { locations, sessionNodes, activePauses, start, pause, resume, end, finishNode, markIncomplete } = useSessionStore();
  const sessions = useSessionStore((state) => state.sessions);
  const active = selectActiveSession({ sessions });
  const [locationId, setLocationId] = useState<string | null>(null);
  /** Where the location menu opens (under the picker); null = closed. */
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  /** Where the "end at…" popover opens; null = closed. */
  const [endMenuAt, setEndMenuAt] = useState<{ x: number; y: number; yAbove: number } | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [nowMs, setNowMs] = useState(Date.now);
  const isRunning = active?.status === 'active';

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  if (!active) {
    const selected = locations.find((location) => location.id === locationId);
    const locationItems: ContextMenuItem[] = locations.map((location) => ({
      label: location.name,
      icon: location.id === locationId ? <Check size={12} /> : <span className="w-3" />,
      onSelect: () => setLocationId(location.id),
    }));
    return (
      <div className="flex items-center gap-1 px-1 pt-1">
        <Timer size={16} className="ml-1 shrink-0 text-fg-muted" aria-hidden />
        <button
          type="button"
          disabled={locations.length === 0}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setMenuAt({ x: box.left, y: box.bottom + 2 });
          }}
          title="session location"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-tab px-2 py-1 text-left text-fg-muted transition-colors duration-panel ease-panel enabled:hover:bg-border-subtle enabled:hover:text-fg-prominent disabled:opacity-50"
          style={{ fontSize: '0.85rem' }}
        >
          <span className="min-w-0 flex-1 truncate">
            new session{selected ? <span className="text-fg-prominent"> @{selected.name}</span> : locations.length === 0 ? ' · no locations' : ''}
          </span>
          <CaretDown size={10} weight="bold" className="shrink-0" />
        </button>
        {menuAt && (
          <ContextMenu
            x={menuAt.x}
            y={menuAt.y}
            items={locationItems}
            onClose={() => setMenuAt(null)}
          />
        )}
        <PacketIconButton
          title={selected ? `start session @${selected.name}` : 'pick a location to start'}
          onClick={() => { if (selected) { void start(selected.id); setLocationId(null); } }}
          isDisabled={!selected}
          color={RUNNING_COLOR}
        >
          <Play size={14} weight="fill" />
        </PacketIconButton>
      </div>
    );
  }

  const mine = sessionNodes.filter((node) => node.sessionId === active.id);
  const doing = mine.filter((node) => node.status === 'in_progress');
  const doneCount = mine.filter((node) => node.status === 'done').length;
  const progress = mine.length > 0 ? doneCount / mine.length : 0;
  const statusColor = isRunning ? RUNNING_COLOR : PAUSED_COLOR;
  const wallMs = active.actualStart ? Date.now() - Date.parse(active.actualStart) : 0;
  const isLong = wallMs > LONG_SESSION_MS;
  /** Opens the end-at popover under the pause/stop buttons. */
  const openEndMenu = () => {
    const box = controlsRef.current?.getBoundingClientRect();
    if (box) setEndMenuAt({ x: box.right - 220, y: box.bottom + 4, yAbove: box.top - 4 });
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 border-t border-border-subtle px-2 pb-1.5 pt-2">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusColor }} />
        <span className="min-w-0 flex-1 truncate font-semibold text-fg-prominent" style={{ fontSize: '0.82rem' }} title={active.title}>
          {active.title}
        </span>
        <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.68rem' }}>
          {isRunning ? (active.locationName ? `@${active.locationName}` : 'active') : 'paused'}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-fg-prominent" style={{ fontSize: '1.45rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {formatTimer(sessionElapsedMs(active, activePauses, nowMs))}
        </span>
        <div ref={controlsRef} className="flex items-center gap-0.5">
          <PacketIconButton title={isRunning ? 'pause session' : 'resume session'} onClick={() => void (isRunning ? pause() : resume())}>
            {isRunning ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </PacketIconButton>
          <PacketIconButton title="end session now" onClick={() => void end('completed')}>
            <Stop size={14} weight="fill" />
          </PacketIconButton>
          <PacketIconButton title="end session at…" onClick={openEndMenu}>
            <CaretDown size={10} weight="bold" />
          </PacketIconButton>
        </div>
      </div>

      {isLong && (
        <button
          type="button"
          onClick={openEndMenu}
          className="rounded-row px-2 py-1 text-left transition-colors duration-panel ease-panel hover:bg-border-subtle"
          style={{ fontSize: '0.72rem', color: PAUSED_COLOR }}
        >
          Running {formatDuration(wallMs / 60_000)} — did you stop earlier?
        </button>
      )}
      {endMenuAt && active.actualStart && (
        <EndSessionPopover
          x={endMenuAt.x}
          y={endMenuAt.y}
          yAbove={endMenuAt.yAbove}
          startIso={active.actualStart}
          lastActivityMs={lastActivityMs(mine, activePauses)}
          onEnd={(endTime) => { setEndMenuAt(null); void end('completed', endTime); }}
          onClose={() => setEndMenuAt(null)}
        />
      )}

      <AnimatePresence initial={false}>
      {doing.map((node) => (
        <motion.div key={node.nodeId} {...COLLAPSE} className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: node.arcColor ?? NO_ARC_COLOR }} />
          <span className="min-w-0 flex-1 truncate text-fg-prominent" style={{ fontSize: '0.8rem' }} title={node.title}>{node.title}</span>
          <PacketIconButton title="finish node" color={RUNNING_COLOR} onClick={() => void finishNode(active.id, node.nodeId)}>
            <Check size={14} weight="bold" />
          </PacketIconButton>
          <PacketIconButton title="skip node (mark incomplete)" onClick={() => void markIncomplete(active.id, node.nodeId)}>
            <SkipForward size={14} weight="fill" />
          </PacketIconButton>
        </motion.div>
      ))}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {mine.length > 0 && (
          <motion.div key="progress" {...COLLAPSE} className="flex flex-col gap-1">
            <div className="h-1 overflow-hidden rounded-row bg-border-subtle">
              <motion.div className="h-full" initial={false} animate={{ width: `${progress * 100}%` }} transition={PANEL_TRANSITION} style={{ background: statusColor }} />
            </div>
            <span className="text-fg-faint" style={{ fontSize: '0.68rem' }}>{doneCount} of {mine.length} nodes done</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Fades the idle picker and the live session into each other when a session starts or ends. */
export function SessionPanel() {
  const isLive = useSessionStore((state) => selectActiveSession({ sessions: state.sessions }) !== null);
  return (
    <MotionConfig reducedMotion="user">
      <motion.div key={isLive ? 'live' : 'idle'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: PANEL_EASE }}>
        <SessionPanelBody />
      </motion.div>
    </MotionConfig>
  );
}
