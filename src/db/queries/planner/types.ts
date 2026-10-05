// Domain types for planner.sqlite (see migrations/planner/0001_init.sql).
// Field names mirror the columns in camelCase. The src/planner/* mocks define
// their own simplified UI-only shapes; those get replaced by these when wired.

export type NodeType = 'task' | 'event';
/** Where a task lives: inbox (untriaged), grill (the few most important), hot (working now), cold (someday) or freezer (super long term). Events and routine occurrences ignore it. */
export type Pool = 'inbox' | 'grill' | 'hot' | 'cold' | 'freezer';
export type EntityStatus = 'active' | 'done' | 'archived';
/** Mycelium only ever stores 0 (normal) or 1 (important). */
export type Importance = 0 | 1;

export interface Arc {
  id: string;
  name: string;
  colorHex: string;
  description: string;
  status: EntityStatus;
  createdAt: string;
}

export interface Project {
  id: string;
  arcId: string | null;
  name: string;
  description: string;
  status: EntityStatus;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

export interface PlannerGroup {
  id: string;
  name: string;
  colorHex: string;
  sortOrder: number;
  isUngrouped: boolean;
  createdAt: string;
}

export interface PlannerNode {
  id: string;
  projectId: string | null;
  arcId: string | null;
  title: string;
  nodeType: NodeType;
  pool: Pool;
  /** Local wall-clock: YYYY-MM-DD (date only) or YYYY-MM-DDTHH:MM:SS. */
  plannedStartAt: string | null;
  /** YYYY-MM-DD */
  dueAt: string | null;
  actualCompletedAt: string | null;
  estimatedDurationMinutes: number | null;
  importanceLevel: Importance;
  isCompleted: boolean;
  isLocked: boolean;
  isPinned: boolean;
  isFrogPinned: boolean;
  isRoutine: boolean;
  routineId: string | null;
  createdAt: string;
  updatedAt: string;
  groupIds: string[];
  subTotal: number;
  subDone: number;
}

export interface SubTask {
  id: string;
  nodeId: string;
  title: string;
  isCompleted: boolean;
  sortOrder: number;
  createdAt: string;
}

/** Dependency: `sourceId` blocks `targetId`. */
export interface NodeEdge {
  id: string;
  projectId: string;
  sourceId: string;
  targetId: string;
  createdAt: string;
}

export type RuleFreq = 'daily' | 'weekly' | 'monthly' | 'manual';

export interface RoutineRule {
  id: string;
  routineId: string;
  sortOrder: number;
  freq: RuleFreq;
  repeatInterval: number;
  /** Weekly only, 0 = Sun … 6 = Sat. Empty means "every N weeks from the start date". */
  days: number[];
  startDate: string;
  endMode: 'count' | 'date';
  endCount: number | null;
  endDate: string | null;
  /** HH:MM */
  startTime: string | null;
  durationMinutes: number | null;
  exceptions: string[];
}

export type RoutineRuleInput = Omit<RoutineRule, 'id' | 'routineId' | 'sortOrder'>;

export interface Routine {
  id: string;
  title: string;
  nodeType: NodeType;
  arcId: string | null;
  projectId: string | null;
  importanceLevel: Importance;
  createdAt: string;
  updatedAt: string;
  rules: RoutineRule[];
  groupIds: string[];
}

export interface WorkLocation {
  id: string;
  name: string;
  createdAt: string;
}

export type SessionStatus = 'planned' | 'active' | 'paused' | 'completed' | 'interrupted';
export type SessionNodeStatus = 'queued' | 'in_progress' | 'done' | 'incomplete';

export interface WorkSession {
  id: string;
  title: string;
  locationId: string | null;
  locationName: string | null;
  plannedDate: string;
  /** ISO UTC instants. */
  actualStart: string | null;
  actualEnd: string | null;
  status: SessionStatus;
  createdAt: string;
}

export interface SessionNode {
  sessionId: string;
  nodeId: string;
  sortOrder: number;
  status: SessionNodeStatus;
  timeStarted: string | null;
  timeFinished: string | null;
  totalMinutes: number | null;
  title: string;
  nodeType: NodeType;
  arcId: string | null;
  projectId: string | null;
  arcName: string | null;
  arcColor: string | null;
}

export interface SessionPause {
  id: string;
  sessionId: string;
  pausedAt: string;
  resumedAt: string | null;
  pauseType: 'manual' | 'pomo_short' | 'pomo_long';
}

export interface UserCapacity {
  id: string;
  dailyMinutes: number;
  peakStart: string;
  peakEnd: string;
  updatedAt: string;
}
