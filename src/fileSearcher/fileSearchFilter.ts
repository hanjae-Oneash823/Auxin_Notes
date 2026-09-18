/**
 * Ranks `items` against `query`: names starting with `query` sort first,
 * names merely containing it come after, everything else is dropped.
 * Case-insensitive. Returns `items` unchanged (no re-sort) when `query` is
 * empty, so the carousel's default order matches `buildFolderTree`'s own
 * alphabetical sort.
 */
export function filterAndRank<T>(items: T[], query: string, getName: (item: T) => string): T[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items;

  const startsWith: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const name = getName(item).toLowerCase();
    if (name.startsWith(trimmed)) startsWith.push(item);
    else if (name.includes(trimmed)) contains.push(item);
  }
  return [...startsWith, ...contains];
}
