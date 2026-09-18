/** A note's title is just its filename — derived directly from its path
 *  rather than read from the file, so it's always in sync with what's
 *  actually on disk with no extra round trip. Strips whichever tracked
 *  extension the path ends in (`.md` or `.axcanvas` — see `vault_files.rs`
 *  for the Rust-side counterpart of this list). */
export function titleFromPath(path: string): string {
  const fileName = path.split('/').pop() ?? path;
  return fileName.replace(/\.(md|axcanvas)$/, '');
}

/** A path's containing folder ('' for the vault root or a top-level file). */
export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}
