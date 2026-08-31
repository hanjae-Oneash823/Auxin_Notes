/** A note's title is just its filename — derived directly from its path
 *  rather than read from the file, so it's always in sync with what's
 *  actually on disk with no extra round trip. */
export function titleFromPath(path: string): string {
  const fileName = path.split('/').pop() ?? path;
  return fileName.replace(/\.md$/, '');
}
