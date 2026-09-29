import { SidebarSimple } from '@phosphor-icons/react';
import { platform } from '@tauri-apps/plugin-os';
import { usePanelLayoutStore, type SidebarSide } from './panelLayoutStore';

/** Height of the strip reserved at the top of each sidebar for the macOS
 *  traffic lights and the floating toggles (Tailwind `h-9` / `pt-9`). */
export const CHROME_STRIP_CLASS = 'h-9';

/** True where the window uses an overlay title bar (macOS — see
 *  src-tauri/src/lib.rs) and therefore has no header of its own: content
 *  runs to the top edge and this file's floating controls stand in for it.
 *  Other platforms keep their native title bar and need none of this. */
export function hasWindowChrome(): boolean {
  return platform() === 'macos';
}

/** Sidebar glyph for the given side. Phosphor's `mirrored` prop is not used:
 *  it sets a `transform` attribute on the root <svg>, which WebKit ignores,
 *  so the right-hand icon rendered un-flipped. A CSS transform works. */
export function SidebarSideIcon({ side, size = 16 }: { side: SidebarSide; size?: number }) {
  return <SidebarSimple size={size} style={side === 'right' ? { transform: 'scaleX(-1)' } : undefined} />;
}

interface PanelToggleProps {
  side: SidebarSide;
}

function PanelToggle({ side }: PanelToggleProps) {
  const isOpen = usePanelLayoutStore((state) => (side === 'left' ? state.isLeftSidebarOpen : state.isRightSidebarOpen));
  const toggleSidebar = usePanelLayoutStore((state) => state.toggleSidebar);
  const label = `${isOpen ? 'Hide' : 'Show'} ${side === 'left' ? 'sidebar' : 'right panel'}`;

  return (
    <button
      type="button"
      data-tauri-drag-region="false"
      onClick={() => toggleSidebar(side)}
      aria-label={label}
      title={label}
      className={`pointer-events-auto flex h-6 w-6 items-center justify-center rounded-row transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent ${
        isOpen ? 'text-fg-faint' : 'text-fg-muted'
      }`}
    >
      <SidebarSideIcon side={side} />
    </button>
  );
}

/** Floating window controls for macOS, where there is no header bar: the
 *  `[auxin]` label and left-panel toggle beside the traffic lights, the
 *  right-panel toggle in the opposite corner, and a thin drag strip along the
 *  top edge. Fixed to the window (not to a panel) so the toggles stay
 *  reachable while a panel is hidden. The wrapper layers ignore pointer
 *  events; only the buttons opt back in, so everything else under them —
 *  including each sidebar's own drag strip — still receives the mouse. */
export function WindowChrome() {
  const isRightOpen = usePanelLayoutStore((state) => state.isRightSidebarOpen);
  if (!hasWindowChrome()) return null;

  return (
    <>
      <div data-tauri-drag-region className="fixed inset-x-0 top-0 z-30 h-2.5" />
      <div className={`pointer-events-none fixed left-0 top-0 z-40 flex ${CHROME_STRIP_CLASS} items-center gap-2.5 pl-[78px]`}>
        <span className="font-brand text-fg tracking-label uppercase" style={{ fontSize: '1rem' }}>
          [auxin]
        </span>
        <PanelToggle side="left" />
      </div>
      {/* While the right panel is open its own icon bar carries the toggle;
          this one only exists so a hidden panel can be brought back. */}
      {!isRightOpen && (
        <div className={`pointer-events-none fixed right-0 top-0 z-40 flex ${CHROME_STRIP_CLASS} items-center pr-3`}>
          <PanelToggle side="right" />
        </div>
      )}
    </>
  );
}
