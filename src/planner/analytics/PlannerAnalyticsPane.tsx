import { PlannerCalendar } from './PlannerCalendar';
import { SessionHtop } from './SessionHtop';
import { WeekFootprint } from './WeekFootprint';

/** The right panel's Planner layer: Mycelium's calendar, 7-day footprint and session htop. */
export function PlannerAnalyticsPane() {
  return (
    <div className="sidebar-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
      <PlannerCalendar />
      <WeekFootprint />
      <SessionHtop />
    </div>
  );
}
