import { X } from 'lucide-react';

export interface TabItem {
  id: string;
  label: string;
  closable: boolean;
}

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  /** Layout/border classes vary by where this is embedded — the window
   *  header (inline, no border, shares the row with the app label) vs. the
   *  standalone fallback row above the editor on non-macOS platforms. */
  className?: string;
}

/** Browser/editor-style tab strip for the middle panel. Deliberately not
 *  bracketed like the sidebar's `[label]` chrome — the underline/background
 *  already reads as "tab", and a full note title in brackets gets noisy. */
export function TabBar({ tabs, activeTabId, onSelect, onClose, className }: TabBarProps) {
  return (
    <div className={`flex items-stretch overflow-x-auto ${className ?? ''}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`group flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 py-1.5 tracking-menu uppercase transition-colors duration-panel ease-panel ${
              isActive ? 'bg-border-subtle text-fg-prominent' : 'text-fg-faint hover:text-fg-prominent'
            }`}
            style={{ fontSize: '0.7rem' }}
          >
            <span className="max-w-[160px] truncate">{tab.label}</span>
            {tab.closable && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
                className="flex items-center text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg-prominent"
              >
                <X size={11} strokeWidth={2} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
