import type { EditorView } from '@codemirror/view';

/**
 * Maps an absolute note path to its live CodeMirror view, when that note is
 * currently open. Lets `renameEngine` patch an open buffer's text directly
 * (preserving cursor position, undo history) instead of overwriting the file
 * on disk out from under an editor that doesn't know it changed.
 */
const openViews = new Map<string, EditorView>();

export function registerEditorView(path: string, view: EditorView): void {
  openViews.set(path, view);
}

export function unregisterEditorView(path: string): void {
  openViews.delete(path);
}

export function getEditorView(path: string): EditorView | undefined {
  return openViews.get(path);
}
