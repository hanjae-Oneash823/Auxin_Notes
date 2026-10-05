import { useEffect, useState } from 'react';
import { PlannerView } from './PlannerView';

/** Keep in sync with the planner-out duration in global.css. */
const EXIT_MS = 180;
/** Above everything the canvas draws in the content area (its find-on-board bar is z-30), below its z-50 popups. */
const OVERLAY_Z = 'z-40';

/** Slides the Planner over the content area and keeps it mounted through its
 *  exit animation, which a plain conditional render in App's view chain can't do. */
export function PlannerOverlay({ isOpen }: { isOpen: boolean }) {
  const [isMounted, setIsMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setIsMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  if (!isMounted) return null;
  return (
    <div className={`absolute inset-0 ${OVERLAY_Z} bg-bg ${isOpen ? 'planner-in' : 'planner-out'}`}>
      <PlannerView />
    </div>
  );
}
