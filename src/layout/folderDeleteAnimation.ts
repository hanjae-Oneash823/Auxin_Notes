import { collapseOut } from './tabCloseAnimation';

const TREE_SLIDE_MS = 260;
const TREE_SLIDE_PX = 24;
const TREE_EASING = 'cubic-bezier(0.4, 0, 1, 1)';

/** A running folder-delete animation. */
export interface FolderExit {
  /** Resolves once everything has finished leaving. Never rejects. */
  finished: Promise<void>;
  /** Restores everything immediately — for when the delete failed. */
  cancel: () => void;
  /** Cancels after React has had two frames to commit the removal. Call once
   *  the delete has fully landed: the file tree reuses row elements, so a
   *  held-hidden row would otherwise be recycled for a different note. */
  release: () => void;
}

const NO_EXIT: FolderExit = { finished: Promise.resolve(), cancel: () => {}, release: () => {} };

/**
 * Animates a folder's deletion across the UI, before its state actually
 * changes:
 *  - the sidebar tab panel's group for that folder (its name header and every
 *    tab under it, nested folders included) collapses out as one block;
 *  - the file tree's rows for the folder and everything inside it slide and
 *    fade. Rows there sit in fixed virtualized slots, so only their content
 *    can animate — the rows below snap up when the refresh lands, as they do
 *    for the tree's own collapse animation.
 * Elements are found through `data-folder-group` (TabBar) and `data-drop-id`
 * (FolderTree). Returns an inert handle when there's nothing to animate or
 * under `prefers-reduced-motion`.
 */
export function animateFolderDelete(folderPath: string): FolderExit {
  if (!folderPath || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return NO_EXIT;

  const animations: Animation[] = [];
  const collapsedGroups: HTMLElement[] = [];

  const group = document.querySelector<HTMLElement>(`[data-folder-group="${CSS.escape(folderPath)}"]`);
  if (group) {
    collapsedGroups.push(group);
    animations.push(collapseOut(group));
  }

  const insidePrefix = `${folderPath}/`;
  document.querySelectorAll<HTMLElement>('[data-drop-id]').forEach((row) => {
    const dropId = row.dataset.dropId ?? '';
    if (dropId !== folderPath && !dropId.startsWith(insidePrefix)) return;
    animations.push(
      row.animate(
        [
          { transform: 'translateX(0)', opacity: 1 },
          { transform: `translateX(-${TREE_SLIDE_PX}px)`, opacity: 0 },
        ],
        { duration: TREE_SLIDE_MS, easing: TREE_EASING, fill: 'forwards' },
      ),
    );
  });

  if (animations.length === 0) return NO_EXIT;

  const cancel = () => {
    animations.forEach((animation) => animation.cancel());
    collapsedGroups.forEach((element) => {
      element.style.overflow = '';
    });
  };
  return {
    finished: Promise.all(animations.map((animation) => animation.finished)).then(
      () => undefined,
      () => undefined,
    ),
    cancel,
    release: () => requestAnimationFrame(() => requestAnimationFrame(cancel)),
  };
}
