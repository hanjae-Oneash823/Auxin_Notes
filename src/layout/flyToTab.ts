const FLIGHT_MS = 520;
/** The app's panel easing (tokens.css `--ease-panel` family) — a fast start
 *  that settles softly onto the tab card. */
const FLIGHT_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** How long to wait for the tab card to appear in the sidebar after the note
 *  is opened — a new tab mounts on the next React commit, well inside this. */
const TAB_WAIT_MS = 700;
/** Fraction of the flight at which the ghost has landed and starts fading
 *  out while the real tab card fades in underneath it. */
const HANDOFF_OFFSET = 0.72;
/** Fraction of the flight by which the ghost's copied content has faded out —
 *  early, so the box never shows its text stretched toward the tab's shape. */
const CONTENT_FADE_OFFSET = 0.35;
const FALLBACK_FADE_MS = 180;
const GHOST_Z_INDEX = '1000';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

interface Ghost {
  box: HTMLElement;
  /** The copied card/row, drawn at its original size inside the box; null for
   *  a bubble, which is just a coloured shape. */
  content: HTMLElement | null;
  from: DOMRect;
  background: string;
  borderColor: string;
  radius: string;
}

function findTabCard(tabId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(tabId)}"]`);
}

/** Resolves with the tab card once it's in the DOM, or null if it never shows
 *  up (sidebar hidden, or the tab sits in a collapsed group). */
function waitForTabCard(tabId: string): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const deadline = performance.now() + TAB_WAIT_MS;
    const poll = () => {
      const tab = findTabCard(tabId);
      if (tab) return resolve(tab);
      if (performance.now() >= deadline) return resolve(null);
      requestAnimationFrame(poll);
    };
    poll();
  });
}

function createBox(rect: DOMRect): HTMLElement {
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    boxSizing: 'border-box',
    border: '1px solid transparent',
    overflow: 'hidden',
    zIndex: GHOST_Z_INDEX,
    pointerEvents: 'none',
  });
  return box;
}

/** A bubble (an SVG `<g>` holding a `<circle>`): just its circle's on-screen
 *  rect and fill, as a round box. The circle's rect already includes the
 *  bubble's hover scale and drift transforms. */
function ghostFromBubble(source: SVGElement): Ghost {
  const circle = source.querySelector('circle') ?? source;
  const from = circle.getBoundingClientRect();
  const box = createBox(from);
  const background = getComputedStyle(circle).fill;
  const radius = `${Math.min(from.width, from.height) / 2}px`;
  Object.assign(box.style, { backgroundColor: background, borderRadius: radius });
  return { box, content: null, from, background, borderColor: TRANSPARENT, radius };
}

/** A card or row: a box with the element's own look, holding a copy of the
 *  element pinned to its original size — so when the box morphs toward the
 *  tab card's shape the copy is clipped and faded, never squashed. */
function ghostFromElement(source: HTMLElement): Ghost {
  const from = source.getBoundingClientRect();
  const computed = getComputedStyle(source);
  const box = createBox(from);
  const content = source.cloneNode(true) as HTMLElement;
  content.classList.remove('home-rise');
  Object.assign(content.style, {
    position: 'absolute',
    left: '-1px',
    top: '-1px',
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    animation: 'none',
  });
  const { backgroundColor: background, borderColor, borderRadius: radius } = computed;
  Object.assign(box.style, { backgroundColor: background, borderColor, borderRadius: radius });
  box.appendChild(content);
  return { box, content, from, background, borderColor, radius };
}

function createGhost(source: Element): Ghost {
  return source instanceof SVGElement ? ghostFromBubble(source) : ghostFromElement(source as HTMLElement);
}

function fadeOutGhost(ghost: Ghost): void {
  const fade = ghost.box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FALLBACK_FADE_MS, fill: 'forwards' });
  fade.onfinish = () => ghost.box.remove();
}

function landOnTab(ghost: Ghost, tab: HTMLElement): void {
  tab.scrollIntoView({ block: 'nearest' });
  const to = tab.getBoundingClientRect();
  const tabStyle = getComputedStyle(tab);
  const start = {
    left: `${ghost.from.left}px`,
    top: `${ghost.from.top}px`,
    width: `${ghost.from.width}px`,
    height: `${ghost.from.height}px`,
    backgroundColor: ghost.background,
    borderColor: ghost.borderColor,
    borderRadius: ghost.radius,
  };
  const landed = {
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    backgroundColor: tabStyle.backgroundColor === TRANSPARENT ? ghost.background : tabStyle.backgroundColor,
    borderColor: tabStyle.borderColor,
    borderRadius: tabStyle.borderRadius,
  };

  const flight = ghost.box.animate(
    [
      { ...start, opacity: 1, easing: FLIGHT_EASING },
      { ...landed, opacity: 1, offset: HANDOFF_OFFSET },
      { ...landed, opacity: 0 },
    ],
    { duration: FLIGHT_MS },
  );
  flight.onfinish = () => ghost.box.remove();
  flight.oncancel = () => ghost.box.remove();

  ghost.content?.animate([{ opacity: 1 }, { opacity: 0, offset: CONTENT_FADE_OFFSET }, { opacity: 0 }], {
    duration: FLIGHT_MS,
    easing: 'linear',
  });
  tab.animate([{ opacity: 0 }, { opacity: 0, offset: HANDOFF_OFFSET }, { opacity: 1 }], {
    duration: FLIGHT_MS,
    easing: 'linear',
  });
}

/**
 * Flies `source` — a card, a tree row, or a bubble — into the sidebar tab
 * card for `tabId`: a ghost of it lifts off where it sits, morphs (position,
 * size, colour, corner radius) onto the tab card's rectangle, then dissolves
 * while the real tab card fades in beneath it. Call synchronously from the
 * click handler, *before* the view switches, so the source's rect and look
 * are captured while it still exists. Falls back to a quick fade if the tab
 * card never appears, and does nothing under `prefers-reduced-motion`.
 */
export function flyCardToTab(source: Element, tabId: string): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Already the active tab — nothing is being opened, so nothing should fly.
  if (findTabCard(tabId)?.hasAttribute('data-active')) return;

  const ghost = createGhost(source);
  document.body.appendChild(ghost.box);

  void waitForTabCard(tabId).then((tab) => {
    if (tab) landOnTab(ghost, tab);
    else fadeOutGhost(ghost);
  });
}
