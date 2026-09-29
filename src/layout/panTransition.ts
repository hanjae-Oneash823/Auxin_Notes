export type PanDirection = 'up' | 'down';

const PAN_IN_MS = 420;
const PAN_OUT_MS = 340;
/** Ease-out with a soft settle — the app's panel easing family. */
const PAN_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** How far each view travels, as a fraction of the content area's height — a
 *  pan you can see, not a full-screen wipe that would be dizzying when the
 *  shortcut is tapped repeatedly. */
const PAN_DISTANCE_RATIO = 0.16;
const GHOST_ATTRIBUTE = 'data-pan-ghost';

/** Clears a still-running pan (rapid repeated shortcuts): drops the old
 *  ghost and resets the live layer so the next pan starts from a clean state. */
function cancelRunningPan(layer: HTMLElement, host: HTMLElement): void {
  host.querySelectorAll(`[${GHOST_ATTRIBUTE}]`).forEach((ghost) => ghost.remove());
  layer.getAnimations().forEach((animation) => animation.cancel());
}

/** A static, non-interactive copy of the layer's current contents, laid over
 *  it. Scroll offsets are re-applied after it's attached (a clone starts
 *  every scroller at the top), so the outgoing view leaves looking exactly
 *  as the user last saw it. Canvas/WebGL bitmaps aren't copied by cloneNode,
 *  so those views leave as blank fills — acceptable for a 0.3s fade. */
function createGhost(layer: HTMLElement, host: HTMLElement): HTMLElement {
  const ghost = layer.cloneNode(true) as HTMLElement;
  ghost.setAttribute(GHOST_ATTRIBUTE, '');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'absolute',
    left: `${layer.offsetLeft}px`,
    top: `${layer.offsetTop}px`,
    width: `${layer.offsetWidth}px`,
    height: `${layer.offsetHeight}px`,
    pointerEvents: 'none',
    zIndex: '1',
  });
  host.appendChild(ghost);

  const originals = layer.querySelectorAll<HTMLElement>('*');
  const copies = ghost.querySelectorAll<HTMLElement>('*');
  originals.forEach((original, index) => {
    if (original.scrollTop > 0 || original.scrollLeft > 0) {
      copies[index].scrollTop = original.scrollTop;
      copies[index].scrollLeft = original.scrollLeft;
    }
  });
  return ghost;
}

/**
 * Pans the tab content area from the old tab's view to the new one's, for
 * the keyboard tab shortcuts. Call synchronously *before* the tab switches,
 * while the outgoing view is still mounted: it snapshots that view, then —
 * once React has rendered the new one into `layer` — slides the snapshot
 * away and the new view in from the opposite side. `'down'` means moving to
 * a later tab (content travels upward, new view enters from below); `'up'`
 * is the reverse. `layer` must be a child of a positioned, overflow-hidden
 * host so the travel is clipped. Does nothing under `prefers-reduced-motion`.
 */
export function panTabContent(layer: HTMLElement, direction: PanDirection): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = layer.parentElement;
  if (!host) return;

  cancelRunningPan(layer, host);
  const ghost = createGhost(layer, host);
  const distance = layer.offsetHeight * PAN_DISTANCE_RATIO * (direction === 'down' ? 1 : -1);

  // Two frames: the state change has been committed and painted-ready by then.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const leaving = ghost.animate(
        [
          { transform: 'translateY(0)', opacity: 1 },
          { transform: `translateY(${-distance}px)`, opacity: 0 },
        ],
        { duration: PAN_OUT_MS, easing: PAN_EASING, fill: 'forwards' },
      );
      leaving.onfinish = () => ghost.remove();
      leaving.oncancel = () => ghost.remove();

      layer.animate(
        [
          { transform: `translateY(${distance}px)`, opacity: 0 },
          { transform: 'translateY(0)', opacity: 1 },
        ],
        { duration: PAN_IN_MS, easing: PAN_EASING },
      );
    }),
  );
}
