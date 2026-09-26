import { useLayoutEffect, useRef, useState } from 'react';
import { SidebarSimple } from '@phosphor-icons/react';
import { platform } from '@tauri-apps/plugin-os';
import { SIDEBAR_TOGGLE_EASING, SIDEBAR_TOGGLE_MS, usePanelLayoutStore } from './panelLayoutStore';
import { TabBar, type TabItem } from './TabBar';

interface TitleBarProps {
  tabs: TabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onReorderTabs: (draggedId: string, targetId: string, placeAfter: boolean) => void;
}

/** macOS-only draggable header sitting behind the native traffic lights —
 *  the window is built with an overlay title bar (src-tauri/src/lib.rs), so
 *  this is the only thing standing in for a title bar at all. The label box
 *  is pinned to `var(--width-sidebar-left)` — the
 *  same live CSS var Sidebar.tsx's width is bound to — so the tab strip
 *  stays aligned with the left sidebar's right edge
 *  through a resize drag, instead of trailing right after the label. Tabs
 *  live inline here rather than their own row
 *  (browser-style) — the header uses `data-tauri-drag-region="deep"` so the
 *  whole subtree drags/maximizes-on-double-click by default, and `TabBar`
 *  opts each individual tab back out with `data-tauri-drag-region="false"`
 *  (see TabBar.tsx) so clicking/dragging a tab still reorders it instead of
 *  moving the window. Other platforms still get the native title bar and
 *  render nothing here — App.tsx falls back to a standalone `TabBar` row
 *  above the editor there instead. */
export function TitleBar({ tabs, activeTabId, onSelectTab, onCloseTab, onReorderTabs }: TitleBarProps) {
  const isLeftSidebarOpen = usePanelLayoutStore((state) => state.isLeftSidebarOpen);
  const isRightSidebarOpen = usePanelLayoutStore((state) => state.isRightSidebarOpen);
  const toggleSidebar = usePanelLayoutStore((state) => state.toggleSidebar);
  const isToggling = usePanelLayoutStore((state) => state.isToggling);
  const contentRef = useRef<HTMLDivElement>(null);
  // Natural width of the label + button — the collapsed width of the label
  // block. Measured (not hardcoded) because the brand font's width isn't
  // known until it loads, and a width can't transition to `auto`.
  const [contentWidth, setContentWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    setContentWidth(node.offsetWidth);
    const observer = new ResizeObserver(() => setContentWidth(node.offsetWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (platform() !== 'macos') return null;

  return (
    <div
      data-tauri-drag-region="deep"
      className="flex h-9 shrink-0 items-center border-b border-b-border-subtle bg-bg-chrome"
    >
      <div
        data-tauri-drag-region
        className="h-full shrink-0 overflow-hidden"
        style={{
          width: isLeftSidebarOpen || contentWidth === null ? 'var(--width-sidebar-left)' : `${contentWidth}px`,
          transition: isToggling ? `width ${SIDEBAR_TOGGLE_MS}ms ${SIDEBAR_TOGGLE_EASING}` : 'none',
        }}
      >
        <div ref={contentRef} data-tauri-drag-region className="flex h-full w-max items-center gap-2.5 pl-[78px] pr-3">
          <span
            data-tauri-drag-region
            className="font-brand text-fg tracking-label uppercase"
            style={{ fontSize: '1rem' }}
          >
            [auxin]
          </span>
          {/* Opts out of the header's window-drag region so the click toggles
            the sidebar instead of starting a window drag. */}
          <button
            type="button"
            data-tauri-drag-region="false"
            onClick={() => toggleSidebar('left')}
            aria-label={isLeftSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            title={isLeftSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            className={`flex h-6 w-6 items-center justify-center rounded-row transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent ${
              isLeftSidebarOpen ? 'text-fg-faint' : 'text-fg-muted'
            }`}
          >
            <SidebarSimple size={16} />
          </button>
        </div>
      </div>
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        onReorder={onReorderTabs}
        className="min-w-0 flex-1 pr-2"
      />
      <button
        type="button"
        data-tauri-drag-region="false"
        onClick={() => toggleSidebar('right')}
        aria-label={isRightSidebarOpen ? 'Hide right panel' : 'Show right panel'}
        title={isRightSidebarOpen ? 'Hide right panel' : 'Show right panel'}
        className={`mr-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-row transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent ${
          isRightSidebarOpen ? 'text-fg-faint' : 'text-fg-muted'
        }`}
      >
        <SidebarSimple size={16} mirrored />
      </button>
    </div>
  );
}
