import { platform } from '@tauri-apps/plugin-os';
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
 *  is pinned to `var(--width-rail)` plus `var(--width-sidebar-left)` — the
 *  same live CSS var Sidebar.tsx's width is bound to — so the tab strip
 *  stays aligned with the left sidebar's right edge (below the icon rail)
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
  if (platform() !== 'macos') return null;

  return (
    <div
      data-tauri-drag-region="deep"
      className="flex h-9 shrink-0 items-center border-b-[1.5px] border-b-border-strong"
    >
      <div
        data-tauri-drag-region
        // The `_` inside the arbitrary value is Tailwind's escape for a
        // literal space — the CSS spec requires whitespace around `calc()`'s
        // `+`/`-` operators, and Tauri's embedded WebKit (unlike some
        // browsers) actually enforces that: without it the whole `width`
        // declaration silently gets dropped as invalid.
        className="flex h-full w-[calc(var(--width-rail)_+_var(--width-sidebar-left))] shrink-0 items-center pl-[78px]"
      >
        <span
          data-tauri-drag-region
          className="font-brand text-fg tracking-label uppercase"
          style={{ fontSize: '1.2rem' }}
        >
          [auxin]
        </span>
      </div>
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        onReorder={onReorderTabs}
        className="min-w-0 flex-1 pr-2"
      />
    </div>
  );
}
