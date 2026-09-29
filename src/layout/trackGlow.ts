import type { MouseEvent } from 'react';

/** Feeds the pointer position (relative to the card) to `.tab-glow`
 *  (global.css) as CSS vars. Written straight to the element — no React
 *  state — so tracking doesn't re-render the list on every mouse move. Shared
 *  by the sidebar tab cards and the Home dashboard's recent-note cards. */
export function trackGlow(event: MouseEvent<HTMLElement>): void {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
  card.style.setProperty('--my', `${event.clientY - rect.top}px`);
}
