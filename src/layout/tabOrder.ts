/** Returns a copy of `ids` with `draggedId` removed and reinserted next to
 *  `targetId` — after it when `placeAfter` is true. Shared by `TabBar`
 *  (which previews the reorder live while dragging) and `App.tsx` (which
 *  commits it on drop), so the preview and the committed result always
 *  agree — dropping never "jumps" relative to what was just shown. */
export function reorderIds(ids: string[], draggedId: string, targetId: string, placeAfter: boolean): string[] {
  if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) return ids;
  const next = ids.filter((id) => id !== draggedId);
  const insertAt = next.indexOf(targetId) + (placeAfter ? 1 : 0);
  next.splice(insertAt, 0, draggedId);
  return next;
}
