import { useEffect } from 'react';
import { Window } from '@tauri-apps/api/window';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';

/** Hardcoded for v1 — no rebind UI yet (see plan). Deliberately "Cmd+Ctrl"
 *  (both held) rather than "CommandOrControl" (the cross-platform either/or
 *  alias) — this is a real two-modifier combo, not a Mac/Windows variant of
 *  the same binding. Registering the same binding twice (e.g. React
 *  StrictMode's double-invoke in dev) is a no-op on the OS side, so this
 *  doesn't need to guard against that itself. */
const CAPTURE_SHORTCUT = 'Cmd+Ctrl+A';

/**
 * Fires from anywhere, even when Auxin isn't the focused app. Shows and
 * focuses the dedicated "capture" popup window (see src-tauri/src/lib.rs
 * and CaptureWindow.tsx) rather than the main window — this is a Raycast-
 * style always-on-top popup, not an overlay inside the main app, so the
 * main window never has to move or come forward.
 */
export function useGlobalCaptureShortcut(): void {
  useEffect(() => {
    let cancelled = false;

    void register(CAPTURE_SHORTCUT, async (event) => {
      if (event.state !== 'Pressed') return;
      const captureWindow = await Window.getByLabel('capture');
      if (!captureWindow) return;
      await captureWindow.center();
      await captureWindow.show();
      await captureWindow.setFocus();
    }).catch(() => {
      // Another app already holds this binding — silently no-op rather than
      // surfacing an error for a background registration the user didn't
      // directly trigger.
    });

    return () => {
      if (cancelled) return;
      cancelled = true;
      void unregister(CAPTURE_SHORTCUT);
    };
  }, []);
}
