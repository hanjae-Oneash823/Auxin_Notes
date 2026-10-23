import type { Transition } from 'framer-motion';

/** The app's panel easing (matches --ease-panel), as framer-motion wants it. */
export const PANEL_EASE = [0.22, 1, 0.36, 1] as const;
export const PANEL_TRANSITION: Transition = { duration: 0.24, ease: PANEL_EASE };

/** A small spring for things that "pop": status symbols, check marks, badges. */
export const POP_SPRING: Transition = { type: 'spring', stiffness: 460, damping: 28 };
export const POP_IN = { initial: { opacity: 0, scale: 0.4 }, animate: { opacity: 1, scale: 1 }, transition: POP_SPRING } as const;

/** Spread onto a list row under `AnimatePresence`: it drops in on mount, slides out on unmount, and its neighbours glide to make or close the gap. */
export const LIST_ITEM = {
  layout: 'position',
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: 16 },
  transition: PANEL_TRANSITION,
} as const;

/** Spread onto a motion element under `AnimatePresence`: it grows open on mount and folds shut on unmount. */
export const COLLAPSE = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: PANEL_TRANSITION,
  style: { overflow: 'hidden' },
} as const;
