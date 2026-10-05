import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/** The overlay that covers the left sidebar's tabs list while a
 *  dock (imported PDFs, canvases) is open. Render inside an `AnimatePresence`,
 *  with a `key` per dock. Same open/close timing as ContextMenu.tsx: eases out
 *  in, a touch quicker out. */
export function DockPopup({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } }}
      exit={{ opacity: 0, y: -6, scale: 0.985, transition: { duration: 0.1, ease: 'easeIn' } }}
      style={{ transformOrigin: 'top center' }}
      className="absolute inset-0 z-20 flex flex-col rounded-panel bg-bg-panel shadow-[var(--shadow-float)]"
    >
      {children}
    </motion.div>
  );
}
