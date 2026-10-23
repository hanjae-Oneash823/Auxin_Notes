import { create } from 'zustand';
import type Database from '@tauri-apps/plugin-sql';
import { getPlannerDb } from '../db/plannerClient';
import { listGroups, setNodeGroups } from '../db/queries/planner/groups';
import {
  addSubTask, createNode, deleteNode, listEdges, listNodes, listSubTasks, setNodeCompleted, setNodeOrder, setSubTaskCompleted, updateNode,
  type NewNodeInput, type NodePatch,
} from '../db/queries/planner/nodes';
import {
  createRoutine, deleteRoutine, fillMissingRoutineNodes, listRoutines, moveRoutineOccurrence, routineCompletedCounts,
  setRoutineArchived, skipRoutineRange, updateRoutine, type RoutineFields,
} from '../db/queries/planner/routines';
import {
  cascadeArcStatus, createArc, setArcOrder, createProject, deleteArcWithProjects, deleteProject, listArcs, listProjects, updateArc, updateProject,
  type ArcPatch, type NewProjectInput, type ProjectPatch,
} from '../db/queries/planner/structure';
import { createSprint, listSprints, setSprintOrder, updateSprint, type NewSprintInput } from '../db/queries/planner/sprints';
import type { Arc, EntityStatus, NodeEdge, PlannerGroup, PlannerNode, Project, Routine, Sprint, SubTask } from '../db/queries/planner/types';

interface PlannerData {
  arcs: Arc[];
  projects: Project[];
  sprints: Sprint[];
  groups: PlannerGroup[];
  nodes: PlannerNode[];
  edges: NodeEdge[];
  routines: Routine[];
  /** routine id → completed generated nodes. */
  routineDoneCounts: Record<string, number>;
}

interface PlannerState extends PlannerData {
  vaultRoot: string | null;
  isLoaded: boolean;
  /** Message from the last failed database call; the planner view shows it until dismissed. */
  error: string | null;
  /** Subtasks by node id, filled on demand when a node is opened. */
  subTasks: Record<string, SubTask[]>;

  load: (vaultRoot: string) => Promise<void>;
  refresh: () => Promise<void>;
  dismissError: () => void;

  addNode: (input: NewNodeInput) => Promise<void>;
  editNode: (id: string, patch: NodePatch) => Promise<void>;
  setCompleted: (id: string, isCompleted: boolean) => Promise<void>;
  /** Saves a manual order: `orderedIds` first to last. */
  reorderNodes: (orderedIds: readonly string[]) => Promise<void>;
  removeNode: (id: string) => Promise<void>;
  setGroups: (nodeId: string, groupIds: readonly string[]) => Promise<void>;

  addArc: (name: string, colorHex: string) => Promise<void>;
  editArc: (id: string, patch: ArcPatch) => Promise<void>;
  /** Sets the arc's status and carries it to all its projects. */
  setArcStatus: (id: string, status: EntityStatus) => Promise<void>;
  /** Deletes the arc and its projects; their nodes are unassigned. */
  removeArc: (id: string) => Promise<void>;
  /** Saves the Arcs list ranking: `orderedIds` first to last. */
  reorderArcs: (orderedIds: readonly string[]) => Promise<void>;
  addProject: (input: NewProjectInput) => Promise<void>;
  editProject: (id: string, patch: ProjectPatch) => Promise<void>;
  removeProject: (id: string) => Promise<void>;

  addSprint: (input: NewSprintInput) => Promise<void>;
  renameSprint: (id: string, name: string) => Promise<void>;
  /** Moves the sprint to another arc / project (both null for standalone). */
  setSprintScope: (id: string, scope: { arcId: string | null; projectId: string | null }) => Promise<void>;
  /** Ends the sprint: it leaves the dashboard list but its nodes keep their tag. */
  endSprint: (id: string) => Promise<void>;
  /** Saves the hand ranking: `orderedIds` first to last. */
  reorderSprints: (orderedIds: readonly string[]) => Promise<void>;

  loadSubTasks: (nodeId: string) => Promise<void>;
  addSubTask: (nodeId: string, title: string) => Promise<void>;
  toggleSubTask: (nodeId: string, subTaskId: string, isCompleted: boolean) => Promise<void>;

  /** Creates the routine when `id` is null, otherwise saves edits; either way its nodes are (re)generated. */
  saveRoutine: (id: string | null, fields: RoutineFields) => Promise<void>;
  removeRoutine: (id: string) => Promise<void>;
  /** Archives a routine (or brings it back): no upcoming occurrences while archived, history kept. */
  archiveRoutine: (id: string, isArchived: boolean) => Promise<void>;
  /** Skips a routine's occurrences from `from` to `to` (inclusive); one day is a plain skip, more is a pause. */
  skipRoutine: (id: string, from: string, to: string) => Promise<void>;
  /** Moves one occurrence to another day/time (null time = all day) without touching the rule. */
  moveOccurrence: (id: string, fromDate: string, toDate: string, toTime: string | null) => Promise<void>;
}

const EMPTY_DATA: PlannerData = { arcs: [], projects: [], sprints: [], groups: [], nodes: [], edges: [], routines: [], routineDoneCounts: {} };

/** Reads everything. */
async function fetchAll(db: Database): Promise<PlannerData> {
  const [arcs, projects, sprints, groups, nodes, edges, routines, routineDoneCounts] = await Promise.all([
    listArcs(db), listProjects(db), listSprints(db), listGroups(db), listNodes(db), listEdges(db), listRoutines(db), routineCompletedCounts(db),
  ]);
  return { arcs, projects, sprints, groups, nodes, edges, routines, routineDoneCounts };
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const usePlannerStore = create<PlannerState>((set, get) => {
  /** Runs a database change, then reloads everything. A failure is stored in `error` for the UI instead of being dropped. */
  async function mutate(work: (db: Database) => Promise<void>): Promise<void> {
    const { vaultRoot } = get();
    if (!vaultRoot) {
      set({ error: 'The planner is not loaded yet.' });
      return;
    }
    try {
      const db = await getPlannerDb(vaultRoot);
      await work(db);
      set(await fetchAll(db));
    } catch (error) {
      set({ error: messageOf(error) });
    }
  }

  return {
    ...EMPTY_DATA,
    vaultRoot: null,
    isLoaded: false,
    error: null,
    subTasks: {},

    load: async (vaultRoot) => {
      set({ vaultRoot, isLoaded: false, error: null });
      try {
        const db = await getPlannerDb(vaultRoot);
        await fillMissingRoutineNodes(db);
        set({ ...(await fetchAll(db)), isLoaded: true });
      } catch (error) {
        set({ error: messageOf(error), isLoaded: true });
      }
    },

    refresh: () => mutate(async () => {}),
    dismissError: () => set({ error: null }),

    addNode: (input) => mutate(async (db) => { await createNode(db, input); }),
    editNode: (id, patch) => mutate((db) => updateNode(db, id, patch)),
    setCompleted: (id, isCompleted) => mutate((db) => setNodeCompleted(db, id, isCompleted)),
    reorderNodes: (orderedIds) => mutate((db) => setNodeOrder(db, orderedIds)),
    removeNode: (id) => mutate((db) => deleteNode(db, id)),
    setGroups: (nodeId, groupIds) => mutate((db) => setNodeGroups(db, nodeId, groupIds)),

    addArc: (name, colorHex) => mutate(async (db) => { await createArc(db, { name, colorHex }); }),
    editArc: (id, patch) => mutate((db) => updateArc(db, id, patch)),
    setArcStatus: (id, status) => mutate((db) => cascadeArcStatus(db, id, status)),
    removeArc: (id) => mutate((db) => deleteArcWithProjects(db, id)),
    reorderArcs: (orderedIds) => mutate((db) => setArcOrder(db, orderedIds)),
    addProject: (input) => mutate(async (db) => { await createProject(db, input); }),
    editProject: (id, patch) => mutate((db) => updateProject(db, id, patch)),
    removeProject: (id) => mutate((db) => deleteProject(db, id)),

    addSprint: (input) => mutate(async (db) => { await createSprint(db, input); }),
    renameSprint: (id, name) => mutate((db) => updateSprint(db, id, { name })),
    setSprintScope: (id, scope) => mutate((db) => updateSprint(db, id, scope)),
    endSprint: (id) => mutate((db) => updateSprint(db, id, { status: 'done' })),
    reorderSprints: (orderedIds) => mutate((db) => setSprintOrder(db, orderedIds)),

    loadSubTasks: async (nodeId) => {
      const { vaultRoot } = get();
      if (!vaultRoot) return;
      try {
        const subTasks = await listSubTasks(await getPlannerDb(vaultRoot), nodeId);
        set((state) => ({ subTasks: { ...state.subTasks, [nodeId]: subTasks } }));
      } catch (error) {
        set({ error: messageOf(error) });
      }
    },
    addSubTask: async (nodeId, title) => {
      const count = get().subTasks[nodeId]?.length ?? 0;
      await mutate(async (db) => { await addSubTask(db, nodeId, title, count); });
      await get().loadSubTasks(nodeId);
    },
    toggleSubTask: async (nodeId, subTaskId, isCompleted) => {
      await mutate((db) => setSubTaskCompleted(db, subTaskId, isCompleted));
      await get().loadSubTasks(nodeId);
    },

    saveRoutine: (id, fields) => mutate(async (db) => {
      if (id) await updateRoutine(db, id, fields);
      else await createRoutine(db, fields);
    }),
    removeRoutine: (id) => mutate((db) => deleteRoutine(db, id)),
    archiveRoutine: (id, isArchived) => mutate((db) => setRoutineArchived(db, id, isArchived)),
    skipRoutine: (id, from, to) => mutate((db) => skipRoutineRange(db, id, from, to)),
    moveOccurrence: (id, fromDate, toDate, toTime) => mutate((db) => moveRoutineOccurrence(db, id, fromDate, toDate, toTime)),
  };
});
