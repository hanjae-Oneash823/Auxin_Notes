import type { ViewState } from './viewTransforms';

/** Each canvas's last zoom and pan, by file path, for the life of the app
 *  session: switching to another tab and back (which remounts the board)
 *  returns to the same spot. Deliberately not persisted to disk — a camera
 *  position isn't part of the document. */
const savedViews = new Map<string, ViewState>();

export function getSavedView(path: string): ViewState | undefined {
  return savedViews.get(path);
}

export function saveView(path: string, view: ViewState): void {
  savedViews.set(path, view);
}
