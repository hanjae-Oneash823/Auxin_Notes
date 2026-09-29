const CLOSE_MS = 320;
const SLIDE_PX = 28;
const SLIDE_SCALE = 0.95;
/** Fraction of the animation spent sliding/fading out; the rest collapses the
 *  element's height so what's below glides up into the gap. */
const SLIDE_END_OFFSET = 0.4;
/** Accelerates away, like something being flicked off the list. */
const SLIDE_EASING = 'cubic-bezier(0.4, 0, 1, 1)';
const COLLAPSE_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';
/** Set on the card for the duration — guards against a second click while it
 *  is leaving, and lets CSS (`.tab-card[data-closing]`) keep the red close
 *  tint on after the pointer-hover state is gone. */
const CLOSING_ATTRIBUTE = 'data-closing';

/**
 * Slides an element left and fades it, then collapses its height (padding,
 * border and its parent's row gap included, so there's no jump when it's
 * removed). The animation holds its final collapsed frame (`fill: forwards`)
 * until it's cancelled or React unmounts the element, so it can't flash back
 * before its removal lands. Returns the running animation — `cancel()` it to
 * restore the element (and clear the `overflow: hidden` this sets).
 */
export function collapseOut(element: HTMLElement): Animation {
  const height = element.getBoundingClientRect().height;
  const computed = getComputedStyle(element);
  const parent = element.parentElement;
  const rowGap = parent ? parseFloat(getComputedStyle(parent).rowGap) || 0 : 0;
  element.style.overflow = 'hidden';

  const full = {
    height: `${height}px`,
    paddingTop: computed.paddingTop,
    paddingBottom: computed.paddingBottom,
    borderTopWidth: computed.borderTopWidth,
    borderBottomWidth: computed.borderBottomWidth,
    marginBottom: '0px',
  };
  const gone = { opacity: 0, transform: `translateX(-${SLIDE_PX}px) scale(${SLIDE_SCALE})` };

  return element.animate(
    [
      { ...full, opacity: 1, transform: 'translateX(0) scale(1)', easing: SLIDE_EASING },
      { ...full, ...gone, offset: SLIDE_END_OFFSET, easing: COLLAPSE_EASING },
      {
        ...gone,
        height: '0px',
        paddingTop: '0px',
        paddingBottom: '0px',
        borderTopWidth: '0px',
        borderBottomWidth: '0px',
        marginBottom: `${-rowGap}px`,
      },
    ],
    { duration: CLOSE_MS, fill: 'forwards' },
  );
}

/** What should leave with `card`: the card alone, or — when it's the last tab
 *  in its folder group — that whole group (name header included), since the
 *  header disappears the instant its last tab is removed. Walks outward while
 *  each enclosing group would be left with no tab at all, so a chain of
 *  single-child folders collapses as one block from the outermost. */
function findExitTarget(card: HTMLElement): HTMLElement {
  let target = card;
  for (;;) {
    const group = target.parentElement?.closest<HTMLElement>('[data-folder-group]');
    if (!group || group.querySelectorAll('[data-tab-id]').length !== 1) return target;
    target = group;
  }
}

/**
 * Animates a sidebar tab card out — together with its folder name row when
 * it's the last tab in that folder — and calls `onDone` when it has fully
 * gone. The caller removes the tab from state in `onDone`. Under
 * `prefers-reduced-motion`, calls `onDone` immediately.
 */
export function animateTabClose(card: HTMLElement, onDone: () => void): void {
  if (card.hasAttribute(CLOSING_ATTRIBUTE)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onDone();
    return;
  }

  card.setAttribute(CLOSING_ATTRIBUTE, '');
  collapseOut(findExitTarget(card)).onfinish = onDone;
}
