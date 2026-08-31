import { platform } from '@tauri-apps/plugin-os';
import { TabBar, type TabItem } from './TabBar';

interface TitleBarProps {
  tabs: TabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

/** macOS-only draggable header sitting behind the native traffic lights —
 *  the window is built with an overlay title bar (src-tauri/src/lib.rs), so
 *  this is the only thing standing in for a title bar at all. The label box
 *  is pinned to `w-64` — the same fixed width as `Sidebar.tsx` — so the tab
 *  strip lines up with the left sidebar's right edge instead of trailing
 *  right after the label. Tabs live inline here rather than their own row
 *  (browser-style) — `TabBar`'s own root isn't a drag region, so clicks on
 *  tabs/close buttons still register, while the empty space around it keeps
 *  dragging the window. Other platforms still get the native title bar and
 *  render nothing here — App.tsx falls back to a standalone `TabBar` row
 *  above the editor there instead. */
export function TitleBar({ tabs, activeTabId, onSelectTab, onCloseTab }: TitleBarProps) {
  if (platform() !== 'macos') return null;

  return (
    <div data-tauri-drag-region className="flex h-9 shrink-0 items-center border-b border-border-subtle">
      <div data-tauri-drag-region className="flex h-full w-64 shrink-0 items-center pl-[78px]">
        <span
          data-tauri-drag-region
          className="text-fg-faint tracking-label uppercase"
          style={{ fontSize: '0.68rem' }}
        >
          [auxin]
        </span>
      </div>
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        className="min-w-0 flex-1 pr-2"
      />
    </div>
  );
}
