import { useEffect } from 'react';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { openFileSearcherWindow } from './openFileSearcherWindow';

/** Distinct from the sticky-notes capture shortcut (Cmd+Ctrl+A) — no rebind
 *  UI yet, same as that one. */
const FILE_SEARCHER_SHORTCUT = 'Cmd+Ctrl+F';

/**
 * Registered from the main window (mirrors useGlobalCaptureShortcut.ts),
 * but — like that one — it doesn't show any content of the main window
 * itself. It reaches into the separate always-on-top "filesearcher" window
 * so the overlay floats above whatever app currently has focus, instead of
 * bringing all of Auxin forward.
 */
export function useGlobalFileSearcherShortcut(): void {
  useEffect(() => {
    let cancelled = false;

    void register(FILE_SEARCHER_SHORTCUT, async (event) => {
      if (event.state !== 'Pressed') return;
      await openFileSearcherWindow();
    }).catch(() => {
      // Another app already holds this binding — silently no-op, same as
      // the capture shortcut's own registration failure handling.
    });

    return () => {
      if (cancelled) return;
      cancelled = true;
      void unregister(FILE_SEARCHER_SHORTCUT);
    };
  }, []);
}
