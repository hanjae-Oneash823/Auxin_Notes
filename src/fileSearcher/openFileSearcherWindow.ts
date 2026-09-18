import { invoke } from '@tauri-apps/api/core';

/**
 * Shows/centers/focuses the "filesearcher" popup window (see
 * src-tauri/src/lib.rs) — shared by the global shortcut
 * (useGlobalFileSearcherShortcut.ts) and the sidebar button (IconRail.tsx)
 * so both trigger the exact same window.
 *
 * Goes through the `show_file_searcher_panel` command rather than looking
 * the window up and calling `show()`/`setFocus()` directly: on macOS this
 * window is a non-activating NSPanel (see
 * src-tauri/src/commands/file_searcher_panel.rs), and Tauri's generic focus
 * API would activate the whole app (raising "main") on its way to focusing
 * it. The command orders the panel in, makes it key, and gives its webview
 * keyboard focus without activating anything.
 */
export async function openFileSearcherWindow(): Promise<void> {
  await invoke('show_file_searcher_panel');
}
