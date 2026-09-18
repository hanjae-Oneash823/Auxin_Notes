import type { ReactNode } from 'react';
import { Compass, Files, Graph, MagnifyingGlass, Note, PushPin, ShareNetwork, Tag } from '@phosphor-icons/react';
import { openFileSearcherWindow } from '../fileSearcher/openFileSearcherWindow';

export type SidebarView = 'files' | 'search' | 'tags' | 'sticky';

interface IconRailProps {
  activeSidebarView: SidebarView;
  onSelectSidebarView: (view: SidebarView) => void;
  isGraphMode: boolean;
  onToggleGraphMode: () => void;
  isGraph2DMode: boolean;
  onToggleGraph2DMode: () => void;
  isStickyMode: boolean;
  onToggleStickyMode: () => void;
}

interface RailButtonProps {
  title: string;
  isActive: boolean;
  onClick: () => void;
  children: ReactNode;
}

function RailButton({ title, isActive, onClick, children }: RailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center transition-colors duration-panel ease-panel hover:text-fg-prominent ${
        isActive ? 'text-fg-prominent' : 'text-fg-faint'
      }`}
    >
      {children}
    </button>
  );
}

/** Obsidian/VS-Code-style activity bar to the left of the vault `Sidebar` —
 *  switches which single view the sidebar renders (files/search/tags/pinned
 *  sticky notes) and, separately, toggles three full-content-area modes (the
 *  3D graph, the 2D graph, the sticky notes board). All three axes are
 *  orthogonal: the sidebar view and any mode don't affect each other, same
 *  as the sidebar staying visible regardless of graph mode today. */
export function IconRail({
  activeSidebarView,
  onSelectSidebarView,
  isGraphMode,
  onToggleGraphMode,
  isGraph2DMode,
  onToggleGraph2DMode,
  isStickyMode,
  onToggleStickyMode,
}: IconRailProps) {
  return (
    <nav className="flex w-rail shrink-0 flex-col items-center gap-3 border-r border-r-border-strong bg-bg-chrome px-2 py-3">
      <RailButton title="files" isActive={activeSidebarView === 'files'} onClick={() => onSelectSidebarView('files')}>
        <Files size={22} weight="regular" />
      </RailButton>
      <RailButton title="search" isActive={activeSidebarView === 'search'} onClick={() => onSelectSidebarView('search')}>
        <MagnifyingGlass size={22} weight="regular" />
      </RailButton>
      <RailButton title="open the visual file searcher (Cmd+Ctrl+F)" isActive={false} onClick={() => void openFileSearcherWindow()}>
        <Compass size={22} weight="regular" />
      </RailButton>
      <RailButton title="tags" isActive={activeSidebarView === 'tags'} onClick={() => onSelectSidebarView('tags')}>
        <Tag size={22} weight="regular" />
      </RailButton>
      <RailButton title="pinned sticky notes" isActive={activeSidebarView === 'sticky'} onClick={() => onSelectSidebarView('sticky')}>
        <PushPin size={22} weight="regular" />
      </RailButton>
      <RailButton
        title={isGraphMode ? '3D graph view — click to return to the editor' : 'click to open the 3D graph view'}
        isActive={isGraphMode}
        onClick={onToggleGraphMode}
      >
        <Graph size={22} weight="regular" />
      </RailButton>
      <RailButton
        title={isGraph2DMode ? '2D graph view — click to return to the editor' : 'click to open the 2D graph view'}
        isActive={isGraph2DMode}
        onClick={onToggleGraph2DMode}
      >
        <ShareNetwork size={22} weight="regular" />
      </RailButton>
      <RailButton
        title={isStickyMode ? 'sticky notes board — click to return to the editor' : 'click to open the sticky notes board'}
        isActive={isStickyMode}
        onClick={onToggleStickyMode}
      >
        <Note size={22} weight="regular" />
      </RailButton>
    </nav>
  );
}
