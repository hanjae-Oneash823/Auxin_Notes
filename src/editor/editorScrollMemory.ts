/**
 * Maps an absolute note path to the document position (character offset) of
 * whatever line last sat at the top of its viewport, for as long as the app
 * stays open — deliberately module-level state, not persisted to disk:
 * App.tsx remounts `Editor` (`key={activePath}`) on every tab switch, which
 * destroys and recreates the CodeMirror view from scratch, so nothing
 * survives that remount on its own. Mirrors `editorRegistry.ts`'s same
 * per-path `Map` shape.
 *
 * A document position, not a raw pixel `scrollTop` — `Editor.tsx` feeds this
 * straight into `EditorView.scrollIntoView`, which needs a position, and
 * doing so is also what makes the restore itself work correctly (see the
 * comment at its call site for why a raw pixel `scrollTop` write doesn't).
 */
const scrollPositions = new Map<string, number>();

export function saveScrollPosition(path: string, pos: number): void {
  scrollPositions.set(path, pos);
}

export function getScrollPosition(path: string): number {
  return scrollPositions.get(path) ?? 0;
}
