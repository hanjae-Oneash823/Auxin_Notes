import { useRef, useState } from 'react';
import type { CanvasDocument } from '../vault/canvasTypes';

const HISTORY_LIMIT = 100;
/** Edits of one `group` closer together than this fold into a single undo step. */
const COALESCE_MS = 700;

/** How an edit lands on the undo stack:
 *  - `'push'`: its own step (a discrete action — delete, paste, new card…).
 *  - `{ group }`: steps of the same group in quick succession merge, so a
 *    drag, a burst of typing or a resize is undone in one go.
 *  - `'skip'`: not a step (autosize reports, animation frames — the step
 *    for those was recorded once, up front, by the caller). */
export type HistoryMode = 'push' | 'skip' | { group: string };

interface HistoryOptions {
  getDoc: () => CanvasDocument | null;
  /** Installs a document restored by undo/redo (state, ref, autosave). */
  applyDoc: (doc: CanvasDocument) => void;
}

/** Undo/redo over whole-document snapshots. Documents are treated as
 *  immutable (every edit builds a new one), so a snapshot is just a
 *  reference — no copying. */
export function useCanvasHistory({ getDoc, applyDoc }: HistoryOptions) {
  const undoStackRef = useRef<CanvasDocument[]>([]);
  const redoStackRef = useRef<CanvasDocument[]>([]);
  const lastEditRef = useRef<{ group: string | null; at: number }>({ group: null, at: 0 });
  const [depths, setDepths] = useState({ undo: 0, redo: 0 });

  function syncDepths() {
    setDepths({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
  }

  /** Call with the document as it was *before* an edit is applied. */
  function record(before: CanvasDocument, mode: HistoryMode) {
    if (mode === 'skip') return;
    const now = performance.now();
    const group = typeof mode === 'object' ? mode.group : null;
    const last = lastEditRef.current;
    lastEditRef.current = { group, at: now };
    if (group !== null && last.group === group && now - last.at < COALESCE_MS) return;
    undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)), before];
    redoStackRef.current = [];
    syncDepths();
  }

  /** Ends the current coalescing run, so the next edit starts a new step
   *  even if it is in the same group (e.g. the next drag right after one). */
  function breakGroup() {
    lastEditRef.current = { group: null, at: 0 };
  }

  function undo() {
    const current = getDoc();
    const target = undoStackRef.current[undoStackRef.current.length - 1];
    if (!current || !target) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, current];
    breakGroup();
    syncDepths();
    applyDoc(target);
  }

  function redo() {
    const current = getDoc();
    const target = redoStackRef.current[redoStackRef.current.length - 1];
    if (!current || !target) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, current];
    breakGroup();
    syncDepths();
    applyDoc(target);
  }

  function clear() {
    undoStackRef.current = [];
    redoStackRef.current = [];
    breakGroup();
    syncDepths();
  }

  return { record, breakGroup, undo, redo, clear, canUndo: depths.undo > 0, canRedo: depths.redo > 0 };
}
