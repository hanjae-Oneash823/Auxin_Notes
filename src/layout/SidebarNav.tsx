import type { ReactNode } from 'react';
import { Compass, Graph, MagnifyingGlass, Note, PushPin, ShareNetwork, Tag } from '@phosphor-icons/react';
import { openFileSearcherWindow } from '../fileSearcher/openFileSearcherWindow';
import { SidebarPacket } from './SidebarPacket';

export type SidebarView = 'files' | 'search' | 'tags' | 'sticky';

interface SidebarNavProps {
  activeSidebarView: SidebarView;
  onSelectSidebarView: (view: SidebarView) => void;
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

/** Top packet of the left sidebar — replaces the old icon rail. Search/tags/
 *  pinned swap what the sidebar's main packet shows (click the active one
 *  again to return to files); the rest toggle full-content-area modes. The
 *  two axes stay orthogonal, same as before. */
export function SidebarNav({
  activeSidebarView,
  onSelectSidebarView,
  isGraphMode,
  onToggleGraphMode,
  isGraph2DMode,
  onToggleGraph2DMode,
  isStickyMode,
  onToggleStickyMode,
}: SidebarNavProps) {
  function toggleView(view: SidebarView) {
    onSelectSidebarView(activeSidebarView === view ? 'files' : view);
  }

  return (
    <SidebarPacket>
      <NavRow label="Search" isActive={activeSidebarView === 'search'} onClick={() => toggleView('search')}>
        <MagnifyingGlass size={16} />
      </NavRow>
      <NavRow label="Tags" isActive={activeSidebarView === 'tags'} onClick={() => toggleView('tags')}>
        <Tag size={16} />
      </NavRow>
      <NavRow label="Pinned notes" isActive={activeSidebarView === 'sticky'} onClick={() => toggleView('sticky')}>
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
