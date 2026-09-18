import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** Runs `handler` for every `eventName` from the popup, then brings "main"
 *  forward since the popup floats above it rather than being part of it.
 *  Returns the cleanup for a `useEffect`. */
function listenAndFocusMain(eventName: string, handler: (payload: string) => void): () => void {
  let isDisposed = false;
  let unlisten: (() => void) | undefined;

  void listen<string>(eventName, (event) => {
    handler(event.payload);
    const win = getCurrentWindow();
    void win.show();
    void win.setFocus();
  }).then((fn) => {
    // Cleanup can run before registration resolves (StrictMode, or a
    // handler changing) — unregister right away rather than leaking a
    // listener that would run the handler twice.
    if (isDisposed) fn();
    else unlisten = fn;
  });

  return () => {
    isDisposed = true;
    unlisten?.();
  };
}

/**
 * Listens in the main window for the events the separate "filesearcher"
 * popup window emits (see FileSearcherOverlay.tsx) — mirrors the
 * `sticky://created` event stickyStore.ts already listens for, the same
 * cross-window handoff shape:
 * - `fileSearcher://openNote` (vault-relative note path) when a note is picked
 * - `fileSearcher://newNote` (vault-relative folder path, '' = root) when its
 *   "new note here" row is picked
 */
export function useFileSearcherNoteListener(
  openRelativePath: (relativePath: string) => void,
  createNoteInFolder: (folderPath: string) => void,
): void {
  useEffect(() => {
    const stopOpen = listenAndFocusMain('fileSearcher://openNote', openRelativePath);
    const stopCreate = listenAndFocusMain('fileSearcher://newNote', createNoteInFolder);
    return () => {
      stopOpen();
      stopCreate();
    };
  }, [openRelativePath, createNoteInFolder]);
}
