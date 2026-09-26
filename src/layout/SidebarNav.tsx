import type { ReactNode } from 'react';
import { Compass, Graph, Note, PushPin, ShareNetwork } from '@phosphor-icons/react';
import { openFileSearcherWindow } from '../fileSearcher/openFileSearcherWindow';
import { SidebarPacket } from './SidebarPacket';

interface SidebarNavProps {
  isPinnedOpen: boolean;
  onTogglePinned: () => void;
  isGraphMode: boolean;
  onToggleGraphMode: () => void;
  isGraph2DMode: boolean;
  onToggleGraph2DMode: () => void;
  isStickyMode: boolean;
  onToggleStickyMode: () => void;
}

interface NavRowProps {
  label: string;
  title?: string;
  isActive: boolean;
  onClick: () => void;
  children: ReactNode;
}

function NavRow({ label, title, isActive, onClick, children }: NavRowProps) {
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
    </button>
  );
}

/** Top packet of the left sidebar. Pinned notes toggles a dock below it; the
 *  rest toggle full-content-area modes (3D graph, 2D graph, sticky board) or
 *  open the visual file finder. Search and tags now live in the right
 *  panel's layers. */
export function SidebarNav({
  isPinnedOpen,
  onTogglePinned,
  isGraphMode,
  onToggleGraphMode,
  isGraph2DMode,
  onToggleGraph2DMode,
  isStickyMode,
  onToggleStickyMode,
}: SidebarNavProps) {
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
      <NavRow label="Graph 3D" isActive={isGraphMode} onClick={onToggleGraphMode}>
        <Graph size={16} />
      </NavRow>
      <NavRow label="Graph 2D" isActive={isGraph2DMode} onClick={onToggleGraph2DMode}>
        <ShareNetwork size={16} />
      </NavRow>
      <NavRow label="Sticky board" isActive={isStickyMode} onClick={onToggleStickyMode}>
        <Note size={16} />
      </NavRow>
    </SidebarPacket>
  );
}
