import { showPopupPanel } from '../popup/popupPanel';

/** Shows the "filesearcher" popup — shared by the global shortcut
 *  (useGlobalFileSearcherShortcut.ts) and the sidebar button (IconRail.tsx).
 *  See popupPanel.ts for why this isn't a plain window `show()`. */
export function openFileSearcherWindow(): Promise<void> {
  return showPopupPanel('filesearcher');
}
