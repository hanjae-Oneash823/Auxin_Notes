import { CalendarCheck } from '@phosphor-icons/react';
import { SessionPanel } from '../planner/SessionPanel';
import { SidebarPacket } from './SidebarPacket';

/** Cmd+P toggles the Planner (App.tsx); shown on the button so it can be found. */
const PLANNER_SHORTCUT = '⌘P';
const ROW_CLASS = 'flex w-full items-center gap-2.5 rounded-tab px-2 py-1.5 text-left transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent';

interface PlannerAreaProps {
  isActive: boolean;
  onToggle: () => void;
}

/** The Planner's own area in the left sidebar, boxed like the workspace
 *  switcher (a packet holding a lifted, rounded `bg-packet-card` box). The
 *  top row toggles the Planner view; below it sit the session controls. */
export function PlannerArea({ isActive, onToggle }: PlannerAreaProps) {
  return (
    <SidebarPacket>
      <div
        className="rounded-tab p-1"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent-info) 18%, var(--color-packet-card-bg))' }}
      >
        <button
          type="button"
          onClick={onToggle}
          title="schedule, sessions and routines (⌘P)"
          className={`${ROW_CLASS} ${isActive ? 'bg-border-subtle text-fg-prominent' : 'text-fg-muted'}`}
          style={{ fontSize: '0.85rem' }}
        >
          <CalendarCheck size={16} style={{ color: 'var(--accent-info)' }} />
          <span className="truncate font-semibold">Planner</span>
          <span className="ml-auto shrink-0 text-fg-muted" style={{ fontSize: '0.8rem' }}>{PLANNER_SHORTCUT}</span>
        </button>
        <SessionPanel />
      </div>
    </SidebarPacket>
  );
}
