import type { Arc, PlannerNode, Project, SessionNode, WorkSession } from '../db/queries/planner/types';
import type { SleepEntry } from '../db/queries/health/types';
import { formatHours } from '../health/sleepTime.ts';

/** Planned = timed nodes (top half of the strip); actual = work sessions (bottom half);
 *  sleep = a night, as one block as tall as both lanes together. */
export type ClockLane = 'planned' | 'actual' | 'sleep';

/** Time spent on one node inside a session — a bar in the node's arc color. */
export interface ClockSegment {
  id: string;
  startMs: number;
  endMs: number;
  color: string;
  isFinished: boolean;
}

export interface ClockBlock {
  id: string;
  label: string;
  lane: ClockLane;
  startMs: number;
  endMs: number;
  /** Planned blocks: the arc color. Sleep blocks: the sleep color. Session blocks use a fixed dark body and ignore it. */
  color: string;
  isLive: boolean;
  /** Session blocks only: per-node time spent. */
  segments: ClockSegment[];
}

export interface ClockData {
  nodes: readonly PlannerNode[];
  sessions: readonly WorkSession[];
  sessionNodes: readonly SessionNode[];
  sleepEntries: readonly SleepEntry[];
  arcs: readonly Arc[];
  projects: readonly Project[];
}

/** Mycelium's color for nodes and node entries with no arc. */
export const NO_ARC_COLOR = '#b0b0a8';
/** The sleep color the habit grid's sleep row uses. */
export const SLEEP_COLOR = '#7060e0';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
/** Length drawn for a timed node that has no estimate. */
const DEFAULT_NODE_MINUTES = 30;
/** "YYYY-MM-DDTHH:MM" — shorter planned_start_at values are date-only and have no time to draw. */
const MIN_DATETIME_LENGTH = 16;

const pad = (n: number) => String(n).padStart(2, '0');

function clock(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A node's own arc, else its project's arc, else grey (as Mycelium's weekly timetable does). */
function arcColorOf(node: PlannerNode, arcs: readonly Arc[], projects: readonly Project[]): string {
  const arcId = node.arcId ?? projects.find((project) => project.id === node.projectId)?.arcId;
  return arcs.find((arc) => arc.id === arcId)?.colorHex ?? NO_ARC_COLOR;
}

/** Bars for the nodes worked on during a session, clipped to the session's span. A node still
 *  in progress runs for its recorded minutes, else to the end of the session. */
function segmentsOf(entries: readonly SessionNode[], sessionStartMs: number, sessionEndMs: number): ClockSegment[] {
  const segments: ClockSegment[] = [];
  for (const entry of entries) {
    if (!entry.timeStarted) continue;
    const startMs = Math.max(sessionStartMs, Date.parse(entry.timeStarted));
    const isFinished = entry.timeFinished !== null;
    const rawEndMs = entry.timeFinished
      ? Date.parse(entry.timeFinished)
      : entry.totalMinutes
        ? startMs + entry.totalMinutes * MINUTE_MS
        : sessionEndMs;
    const endMs = Math.min(sessionEndMs, rawEndMs);
    if (endMs <= startMs) continue;
    segments.push({ id: entry.nodeId, startMs, endMs, color: entry.arcColor ?? NO_ARC_COLOR, isFinished });
  }
  return segments;
}

const overlaps = (startMs: number, endMs: number, fromMs: number, toMs: number) => endMs >= fromMs && startMs <= toMs;

/**
 * Blocks for the clock strip within [fromMs, toMs]. Timed nodes (local
 * wall-clock planned_start_at) go in the planned lane; sessions that have
 * started go in the actual lane, and a live one runs up to `nowMs`.
 */
export function clockBlocks(
  { nodes, sessions, sessionNodes, sleepEntries, arcs, projects }: ClockData,
  fromMs: number,
  toMs: number,
  nowMs: number,
): ClockBlock[] {
  const blocks: ClockBlock[] = [];

  // First, so the planned and session blocks that overlap a night are drawn on top of it.
  for (const entry of sleepEntries) {
    const startMs = new Date(entry.sleepStart).getTime();
    const endMs = new Date(entry.wakeTime).getTime();
    if (!(endMs > startMs) || !overlaps(startMs, endMs, fromMs, toMs)) continue;
    blocks.push({
      id: `sleep-${entry.id}`,
      label: `Sleep · ${clock(startMs)}–${clock(endMs)} · ${formatHours((endMs - startMs) / HOUR_MS)}`,
      lane: 'sleep', startMs, endMs, color: SLEEP_COLOR, isLive: false, segments: [],
    });
  }

  for (const node of nodes) {
    const at = node.plannedStartAt;
    if (!at || at.length < MIN_DATETIME_LENGTH) continue;
    const startMs = new Date(at).getTime();
    const endMs = startMs + (node.estimatedDurationMinutes ?? DEFAULT_NODE_MINUTES) * MINUTE_MS;
    if (!overlaps(startMs, endMs, fromMs, toMs)) continue;
    blocks.push({ id: `node-${node.id}`, label: `${node.title} · ${clock(startMs)}–${clock(endMs)}`, lane: 'planned', startMs, endMs, color: arcColorOf(node, arcs, projects), isLive: false, segments: [] });
  }

  for (const session of sessions) {
    if (!session.actualStart) continue;
    const startMs = Date.parse(session.actualStart);
    const isLive = session.actualEnd === null && (session.status === 'active' || session.status === 'paused');
    const endMs = session.actualEnd ? Date.parse(session.actualEnd) : isLive ? Math.max(nowMs, startMs) : startMs;
    if (endMs <= startMs || !overlaps(startMs, endMs, fromMs, toMs)) continue;
    const where = session.locationName ? ` @${session.locationName}` : '';
    const entries = sessionNodes.filter((entry) => entry.sessionId === session.id);
    blocks.push({
      id: `session-${session.id}`,
      label: `${session.title}${where} · ${clock(startMs)}–${clock(endMs)}`,
      lane: 'actual',
      startMs,
      endMs,
      color: NO_ARC_COLOR,
      isLive,
      segments: segmentsOf(entries, startMs, endMs),
    });
  }

  return blocks;
}
