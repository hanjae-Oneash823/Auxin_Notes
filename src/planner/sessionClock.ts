import type { SessionNode, SessionPause, WorkSession } from '../db/queries/planner/types';

const MINUTE_MS = 60_000;
/** A live session running this long prompts "did you stop earlier?". */
export const LONG_SESSION_MS = 8 * 60 * MINUTE_MS;

/** Time worked in a session: wall time minus pauses (an open pause counts up to now / the end). */
export function sessionElapsedMs(session: Pick<WorkSession, 'actualStart' | 'actualEnd'>, pauses: readonly SessionPause[], nowMs: number): number {
  if (!session.actualStart) return 0;
  const startMs = Date.parse(session.actualStart);
  const endMs = session.actualEnd ? Date.parse(session.actualEnd) : nowMs;
  const pausedMs = pauses.reduce((sum, pause) => {
    const from = Date.parse(pause.pausedAt);
    const to = pause.resumedAt ? Date.parse(pause.resumedAt) : endMs;
    return sum + Math.max(0, Math.min(to, endMs) - from);
  }, 0);
  return Math.max(0, endMs - startMs - pausedMs);
}

/** Length of a finished session, start to end, in whole minutes (the history view ignores pauses, like Mycelium). */
export function sessionSpanMinutes(session: Pick<WorkSession, 'actualStart' | 'actualEnd'>): number | null {
  if (!session.actualStart || !session.actualEnd) return null;
  return Math.max(0, Math.round((Date.parse(session.actualEnd) - Date.parse(session.actualStart)) / MINUTE_MS));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 05:09 or 1:05:09-style timer; hours appear only once reached. */
export function formatTimer(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return m < 1 ? '<1m' : `${m}m`;
}

/** Local HH:MM of an ISO instant, or "--:--" when missing. */
export function formatClock(iso: string | null): string {
  if (!iso) return '--:--';
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatSessionDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export type EndTimeResult = { isValid: true; iso: string } | { isValid: false; error: string };

/** A picked clock time ("HH:MM") as an end instant: its most recent occurrence
 *  not after `nowMs` (so 22:00 at 9am means last night), which must still fall
 *  after the session's start. */
export function resolveEndTime(hhmm: string, startIso: string, nowMs: number): EndTimeResult {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return { isValid: false, error: 'Enter a time.' };
  const candidate = new Date(nowMs);
  candidate.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (candidate.getTime() > nowMs) candidate.setDate(candidate.getDate() - 1);
  if (candidate.getTime() <= Date.parse(startIso)) return { isValid: false, error: 'That is before the session started.' };
  return { isValid: true, iso: candidate.toISOString() };
}

/** The latest recorded moment of work in a session — node starts/finishes and
 *  pause edges — as a suggestion for when the user really stopped. */
export function lastActivityMs(nodes: readonly Pick<SessionNode, 'timeStarted' | 'timeFinished'>[], pauses: readonly SessionPause[]): number | null {
  const stamps = [
    ...nodes.flatMap((node) => [node.timeStarted, node.timeFinished]),
    ...pauses.flatMap((pause) => [pause.pausedAt, pause.resumedAt]),
  ].flatMap((iso) => (iso ? [Date.parse(iso)] : []));
  return stamps.length > 0 ? Math.max(...stamps) : null;
}
