import type { ReactNode } from 'react';
import { Files, Graph, MagnifyingGlass, Tag } from '@phosphor-icons/react';

export type SidebarView = 'files' | 'search' | 'tags';

interface IconRailProps {
  activeSidebarView: SidebarView;
  onSelectSidebarView: (view: SidebarView) => void;
  isGraphMode: boolean;
  onToggleGraphMode: () => void;
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
 *  switches which single view the sidebar renders (files/search/tags) and,
 *  separately, toggles the main-content graph view. The two are orthogonal:
 *  the sidebar view and graph mode don't affect each other, same as the
 *  sidebar staying visible regardless of graph mode today. */
export function IconRail({ activeSidebarView, onSelectSidebarView, isGraphMode, onToggleGraphMode }: IconRailProps) {
  return (
    <nav className="flex w-rail shrink-0 flex-col items-center gap-3 border-r-[1.5px] border-r-border-strong px-2 py-3">
      <RailButton title="files" isActive={activeSidebarView === 'files'} onClick={() => onSelectSidebarView('files')}>
        <Files size={22} weight="regular" />
      </RailButton>
      <RailButton title="search" isActive={activeSidebarView === 'search'} onClick={() => onSelectSidebarView('search')}>
        <MagnifyingGlass size={22} weight="regular" />
      </RailButton>
      <RailButton title="tags" isActive={activeSidebarView === 'tags'} onClick={() => onSelectSidebarView('tags')}>
        <Tag size={22} weight="regular" />
      </RailButton>
      <RailButton
        title={isGraphMode ? 'graph view — click to return to the editor' : 'click to open the 3D graph view'}
        isActive={isGraphMode}
        onClick={onToggleGraphMode}
      >
        <Graph size={22} weight="regular" />
      </RailButton>
    </nav>
  );
}
