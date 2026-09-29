import { invoke } from '@tauri-apps/api/core';
import { NODE_TRANSITION } from '../fileSearcher/FileSearcherNode';

export type PopupLabel = 'filesearcher' | 'capture';

/**
 * Shows/centers/focuses an always-on-top popup (see
 * src-tauri/src/commands/popup_panel.rs) — shared by the popups' global
 * shortcuts and their in-app entry points, so both trigger the exact same
 * window.
 *
 * Goes through the `show_popup_panel` command rather than looking the window
 * up and calling `show()`/`setFocus()` directly: on macOS these windows are
 * non-activating NSPanels, and Tauri's generic focus API would activate the
 * whole app (raising "main") on its way to focusing one. The command orders
 * the panel in, makes it key, and gives its webview keyboard focus without
 * activating anything.
 */
export async function showPopupPanel(label: PopupLabel): Promise<void> {
  await invoke('show_popup_panel', { label });
}

export function hidePopupPanel(label: PopupLabel): void {
  void invoke('hide_popup_panel', { label });
}

/** A popup's whole-panel intro/outro. The window itself is transparent, so
 *  the `hidden` pose makes it fully invisible while still ordered in — the
 *  panel is only ordered out once the outro settles on it, and it's ordered
 *  back in still wearing it, so the intro always starts from nothing. The
 *  outro is quicker than the intro so dismissing never feels like it's
 *  waiting on an animation. */
export const PANEL_VARIANTS = {
  shown: { opacity: 1, scale: 1, y: 0, transition: NODE_TRANSITION },
  hidden: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.16, ease: 'easeIn' as const } },
};
