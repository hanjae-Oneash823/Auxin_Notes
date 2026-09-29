/** The bin is an ordinary top-level vault folder, so trashed notes stay on
 *  disk (and recoverable outside the app) until it's emptied. */
export const TRASH_FOLDER = 'Trash';

/** Tailwind class for the bin's orange (see `--accent-trash`, tokens.css). */
export const TRASH_COLOR_CLASS = 'text-[color:var(--accent-trash)]';

export function isTrashFolder(path: string): boolean {
  return path === TRASH_FOLDER;
}

/** True for the bin itself and everything inside it. */
export function isInTrash(path: string): boolean {
  return path === TRASH_FOLDER || path.startsWith(`${TRASH_FOLDER}/`);
}
