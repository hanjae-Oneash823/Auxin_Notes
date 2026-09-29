import type { ReactNode } from 'react';
import { Compass, Note, PushPin } from '@phosphor-icons/react';
import { openFileSearcherWindow } from '../fileSearcher/openFileSearcherWindow';
import { useStickyStore } from '../sticky/stickyStore';
import { CountBadge } from './CountBadge';
import { SidebarPacket } from './SidebarPacket';

interface SidebarNavProps {
  isPinnedOpen: boolean;
  onTogglePinned: () => void;
  isStickyMode: boolean;
  onToggleStickyMode: () => void;
}

interface NavRowProps {
  label: string;
  title?: string;
  isActive: boolean;
  onClick: () => void;
  /** A count shown in a small square at the row's right end. */
  count?: number;
  children: ReactNode;
}

function NavRow({ label, title, isActive, onClick, count, children }: NavRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={`flex w-full items-center gap-2.5 rounded-row px-2 py-1.5 text-left transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent ${
        isActive ? 'bg-border-subtle text-fg-prominent' : 'text-fg-muted'
      }`}
      style={{ fontSize: '0.85rem' }}
    >
      {children}
      <span className="truncate">{label}</span>
      {count !== undefined && <CountBadge count={count} className="ml-auto" />}
    </button>
  );
}

/** Top packet of the left sidebar. Pinned notes toggles a dock below it; the
 *  rest toggle a full-content-area mode (sticky board) or open the visual
 *  file finder. Search and tags now live in the right panel's layers. The
 *  2D/3D graph views are hidden from here for now (still reachable as
 *  content-area modes, just not from this nav — see isGraphMode/
 *  isGraph2DMode in App.tsx), not removed outright. */
export function SidebarNav({
  isPinnedOpen,
  onTogglePinned,
  isStickyMode,
  onToggleStickyMode,
}: SidebarNavProps) {
  const stickyCount = useStickyStore((state) => state.notes.length);

  return (
    <SidebarPacket>
      <NavRow label="Pinned notes" isActive={isPinnedOpen} onClick={onTogglePinned}>
        <PushPin size={16} />
      </NavRow>
      <NavRow
        label="File finder"
        title="open the visual file searcher (Cmd+Ctrl+F)"
        isActive={false}
        onClick={() => void openFileSearcherWindow()}
      >
        <Compass size={16} />
      </NavRow>
      <NavRow label="Sticky board" isActive={isStickyMode} onClick={onToggleStickyMode} count={stickyCount}>
        <Note size={16} />
      </NavRow>
    </SidebarPacket>
  );
}
