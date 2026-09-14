import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { getDb } from '../db/client';
import {
  addChecklistItem,
  createStickyNote,
  deleteChecklistItem,
  deleteStickyNote,
  listStickyNotes,
  reorderPinned,
  setPinned as setPinnedQuery,
  toggleChecklistItem,
  updateBoardPosition,
  updateChecklistItemText,
  updateStickyNote,
  type CreateStickyNoteInput,
  type StickyNote,
  type UpdateStickyNoteInput,
} from '../db/queries/sticky';

interface StickyState {
  vaultRoot: string | null;
  notes: StickyNote[];
  isLoaded: boolean;

  load: (vaultRoot: string) => Promise<void>;
  create: (input: CreateStickyNoteInput) => Promise<void>;
  update: (id: string, input: UpdateStickyNoteInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setPinned: (id: string, pinned: boolean) => Promise<void>;
  reorderPinned: (orderedIds: string[]) => Promise<void>;
  setBoardPosition: (id: string, x: number, y: number, persist: boolean) => void;
  addChecklistItem: (noteId: string, text: string) => Promise<void>;
  toggleChecklistItem: (noteId: string, itemId: string, checked: boolean) => Promise<void>;
  updateChecklistItemText: (noteId: string, itemId: string, text: string) => Promise<void>;
  removeChecklistItem: (noteId: string, itemId: string) => Promise<void>;
}

function replaceNote(notes: StickyNote[], id: string, updater: (note: StickyNote) => StickyNote): StickyNote[] {
  return notes.map((note) => (note.id === id ? updater(note) : note));
}

// Registered lazily, the first time `load` runs (i.e. from App.tsx's effect,
// once React has mounted) rather than at raw module-eval time — every other
// Tauri API call in this codebase follows that same rule (see vaultStore.ts's
// `listen('vault://changed', ...)` inside `openVault`), and calling into the
// Tauri IPC bridge before that point isn't something to rely on. The capture
// popup (CaptureWindow.tsx) writes a new note straight to the database
// itself, then emits this event so this window's copy of the note list picks
// it up without a full reload.
let hasSubscribedToCreated = false;
function subscribeToCreatedOnce(): void {
  if (hasSubscribedToCreated) return;
  hasSubscribedToCreated = true;
  void listen<StickyNote>('sticky://created', (event) => {
    useStickyStore.setState((state) => ({ notes: [...state.notes, event.payload] }));
  });
}

export const useStickyStore = create<StickyState>((set, get) => ({
  vaultRoot: null,
  notes: [],
  isLoaded: false,

  load: async (vaultRoot: string) => {
    subscribeToCreatedOnce();
    const db = await getDb(vaultRoot);
    const notes = await listStickyNotes(db);
    set({ vaultRoot, notes, isLoaded: true });
  },

  create: async (input: CreateStickyNoteInput) => {
    const { vaultRoot } = get();
    if (!vaultRoot) return;
    const db = await getDb(vaultRoot);
    const note = await createStickyNote(db, input);
    set((state) => ({ notes: [...state.notes, note] }));
  },

  update: async (id: string, input: UpdateStickyNoteInput) => {
    const { vaultRoot } = get();
    if (!vaultRoot) return;
    const db = await getDb(vaultRoot);
    await updateStickyNote(db, id, input);
    const now = new Date().toISOString();
    set((state) => ({
      notes: replaceNote(state.notes, id, (note) => ({ ...note, ...input, modified: now })),
    }));
  },

  remove: async (id: string) => {
    const { vaultRoot } = get();
    if (!vaultRoot) return;
    const db = await getDb(vaultRoot);
    await deleteStickyNote(db, id);
    set((state) => ({ notes: state.notes.filter((note) => note.id !== id) }));
  },

  setPinned: async (id: string, pinned: boolean) => {
    const { vaultRoot, notes } = get();
    if (!vaultRoot) return;
    const db = await getDb(vaultRoot);
    const nextOrder = pinned ? notes.filter((note) => note.pinned).length : undefined;
    await setPinnedQuery(db, id, pinned, nextOrder);
    set((state) => ({
      notes: replaceNote(state.notes, id, (note) => ({
        ...note,
        pinned,
        pinnedOrder: pinned ? nextOrder ?? 0 : null,
      })),
    }));
  },

  reorderPinned: async (orderedIds: string[]) => {
    const { vaultRoot } = get();
    if (!vaultRoot) return;
    const db = await getDb(vaultRoot);
    await reorderPinned(db, orderedIds);
    const orderById = new Map(orderedIds.map((id, index) => [id, index]));
    set((state) => ({
      notes: state.notes.map((note) =>
        orderById.has(note.id) ? { ...note, pinnedOrder: orderById.get(note.id) ?? note.pinnedOrder } : note,
      ),
    }));
  },

  /** `persist: false` during an in-progress drag (local state only, so the
   *  board renders every frame without hitting the database); `true` once
   *  on pointer-up to write the settled position. */
  setBoardPosition: (id: string, x: number, y: number, persist: boolean) => {
    set((state) => ({
      notes: replaceNote(state.notes, id, (note) => ({ ...note, boardX: x, boardY: y })),
    }));
    if (!persist) return;
    const { vaultRoot } = get();
    if (!vaultRoot) return;
    void getDb(vaultRoot).then((db) => updateBoardPosition(db, id, x, y));
  },

  addChecklistItem: async (noteId: string, text: string) => {
    const { vaultRoot, notes } = get();
    if (!vaultRoot) return;
    const db = await getDb(vaultRoot);
    const note = notes.find((candidate) => candidate.id === noteId);
    const item = await addChecklistItem(db, noteId, text, note?.items.length ?? 0);
    set((state) => ({
      notes: replaceNote(state.notes, noteId, (candidate) => ({ ...candidate, items: [...candidate.items, item] })),
    }));
  },

  toggleChecklistItem: async (noteId: string, itemId: string, checked: boolean) => {
    const { vaultRoot } = get();
    if (!vaultRoot) return;
    const db = await getDb(vaultRoot);
    await toggleChecklistItem(db, itemId, checked);
    set((state) => ({
      notes: replaceNote(state.notes, noteId, (note) => ({
        ...note,
        items: note.items.map((item) => (item.id === itemId ? { ...item, checked } : item)),
      })),
    }));
  },

  updateChecklistItemText: async (noteId: string, itemId: string, text: string) => {
    const { vaultRoot } = get();
    if (!vaultRoot) return;
    const db = await getDb(vaultRoot);
    await updateChecklistItemText(db, itemId, text);
    set((state) => ({
      notes: replaceNote(state.notes, noteId, (note) => ({
        ...note,
        items: note.items.map((item) => (item.id === itemId ? { ...item, text } : item)),
      })),
    }));
  },

  removeChecklistItem: async (noteId: string, itemId: string) => {
    const { vaultRoot } = get();
    if (!vaultRoot) return;
    const db = await getDb(vaultRoot);
    await deleteChecklistItem(db, itemId);
    set((state) => ({
      notes: replaceNote(state.notes, noteId, (note) => ({
        ...note,
        items: note.items.filter((item) => item.id !== itemId),
      })),
    }));
  },
}));
