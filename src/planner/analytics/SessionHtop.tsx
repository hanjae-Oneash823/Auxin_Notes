import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { getPlannerDb } from '../../db/plannerClient';
import { arcBreakdown, type ArcMinutes } from '../../db/queries/planner/sessions';
import { PacketIconButton, SidebarPacket } from '../../layout/SidebarPacket';
import { usePlannerStore } from '../plannerStore';
import { useSessionStore } from '../sessionStore';
import { dateKey } from './analyticsData';

const SLOT_COUNT = 4;
const BAR_COLS = 6;
const WEEK_DAYS = 7;
const FILL_STEP_MS = 100;
const FLICKER_MS = 650;

interface Slot {
  arcName: string;
  arcColor: string;
  label: string;
  taskCount: number;
  totalMinutes: number;
  /** Bar characters the slot is heading toward / currently shows — the bar fills one character at a time. */
  target: number;
  fill: number;
}

const isVisible = (slot: Slot) => slot.fill > 0 || slot.target > 0 || slot.label !== '';
const daysAgo = (days: number): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
};
const shortDate = (date: Date) => `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
const formatHours = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, '0')}m`;

/** Merges fresh arc data into the slots on screen: an arc that keeps its slot keeps its bar and animates to the new length. */
function mergeSlots(data: readonly ArcMinutes[], previous: readonly Slot[]): Slot[] {
  const total = data.reduce((sum, row) => sum + row.totalMinutes, 0);
  const merged = Array.from({ length: SLOT_COUNT }, (_, i): Slot | null => {
    const row = data[i];
    const before = previous[i];
    if (!row) return before ? { ...before, target: 0, label: '' } : null;
    return {
      arcName: row.arcName,
      arcColor: row.arcColor,
      label: total > 0 ? `${((row.totalMinutes / total) * 100).toFixed(1)}%` : '0.0%',
      taskCount: row.taskCount,
      totalMinutes: row.totalMinutes,
      target: total > 0 ? Math.round((row.totalMinutes / total) * BAR_COLS) : 0,
      fill: before?.fill ?? 0,
    };
  });
  return merged.filter((slot): slot is Slot => slot !== null && isVisible(slot));
}

/** Mycelium's "session htop": time share per arc over a week, drawn as `[||||  ] 39.0%` bars that fill and flicker. */
export function SessionHtop() {
  const vaultRoot = usePlannerStore((state) => state.vaultRoot);
  const sessionNodes = useSessionStore((state) => state.sessionNodes);
  const [offset, setOffset] = useState(0);
  const [slots, setSlots] = useState<readonly Slot[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tick, setTick] = useState(0);

  const toDate = daysAgo(offset * WEEK_DAYS);
  const fromDate = daysAgo(offset * WEEK_DAYS + WEEK_DAYS - 1);
  const [from, to] = [dateKey(fromDate), dateKey(toDate)];

  useEffect(() => {
    if (!vaultRoot) return;
    let isCurrent = true;
    getPlannerDb(vaultRoot)
      .then((db) => arcBreakdown(db, from, to))
      .then((data) => {
        if (!isCurrent) return;
        setSlots((previous) => mergeSlots(data, previous));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        console.error('Failed to load the session breakdown', error);
        if (isCurrent) setStatus('error');
      });
    return () => { isCurrent = false; };
  }, [vaultRoot, from, to, sessionNodes]);

  useEffect(() => {
    const fill = window.setInterval(() => {
      setSlots((current) => {
        if (current.every((slot) => slot.fill === slot.target)) return current;
        return current
          .map((slot) => (slot.fill === slot.target ? slot : { ...slot, fill: slot.fill + Math.sign(slot.target - slot.fill) }))
          .filter(isVisible);
      });
    }, FILL_STEP_MS);
    const flicker = window.setInterval(() => setTick((value) => value + 1), FLICKER_MS);
    return () => {
      window.clearInterval(fill);
      window.clearInterval(flicker);
    };
  }, []);

  return (
    <SidebarPacket
      title="Session htop"
      actions={
        <>
          <PacketIconButton title="previous week" onClick={() => setOffset((value) => value + 1)}><CaretLeft size={12} weight="bold" /></PacketIconButton>
          <span className="text-fg-faint" style={{ fontSize: '0.68rem' }}>{shortDate(fromDate)}–{shortDate(toDate)}</span>
          <PacketIconButton title="next week" isDisabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 1))}><CaretRight size={12} weight="bold" /></PacketIconButton>
        </>
      }
    >
      <div className="px-1.5 pb-2 pt-1">
        {status !== 'ready' || slots.length === 0 ? (
          <span className="text-fg-faint" style={{ fontSize: '0.78rem' }}>
            {status === 'error' ? 'could not load sessions' : status === 'loading' ? 'loading…' : 'no session data'}
          </span>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono" style={{ fontSize: '0.78rem' }}>
            {slots.map((slot, i) => {
              const isAtRest = slot.fill === slot.target;
              const flicker = isAtRest && slot.fill > 0 ? 1 + (i % 2) : 0;
              const isFlickerOn = (tick + i) % 2 === 0;
              return (
                <div key={i} className="min-w-0" title={`tasks ${slot.taskCount} · time ${formatHours(slot.totalMinutes)}`}>
                  <motion.div key={slot.arcName} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="truncate" style={{ color: slot.arcColor }}>
                    {slot.arcName}
                  </motion.div>
                  <div className="flex items-baseline overflow-hidden whitespace-pre text-fg-prominent">
                    <span>[</span>
                    <span style={{ color: slot.arcColor }}>{'|'.repeat(Math.max(0, slot.fill - flicker))}</span>
                    <span style={{ color: isFlickerOn ? slot.arcColor : 'transparent' }}>{'|'.repeat(flicker)}</span>
                    <span>{' '.repeat(BAR_COLS - slot.fill)}</span>
                    <span>]</span>
                    <span className="ml-[0.4ch]">{slot.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SidebarPacket>
  );
}
