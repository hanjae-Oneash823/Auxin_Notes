import { create } from 'zustand';

/** How long the show/hide width transition runs, shared by everything that
 *  animates with it (the sidebar itself and the header's label block). */
export const SIDEBAR_TOGGLE_MS = 220;
export const SIDEBAR_TOGGLE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
// Small buffer past the transition so `isToggling` never clears mid-animation.
const TOGGLE_SETTLE_BUFFER_MS = 40;

interface SidebarVisibilityState {
  isLeftSidebarOpen: boolean;
  /** True only while a show/hide is animating. The width transition is gated
   *  on this because the same CSS width var is written live by the resize
   *  drag — a permanent transition would make dragging lag behind the
   *  pointer. */
  isToggling: boolean;
  toggleLeftSidebar: () => void;
}

let settleTimer: number | null = null;

/** Whether the left sidebar is shown. Its own store (not App state) because
 *  the toggle lives in `TitleBar` while the panel it hides is rendered from
 *  `VaultReady` — siblings with no shared parent state between them. */
export const useSidebarVisibilityStore = create<SidebarVisibilityState>((set, get) => ({
  isLeftSidebarOpen: true,
  isToggling: false,
  toggleLeftSidebar: () => {
    if (settleTimer !== null) window.clearTimeout(settleTimer);
    set((state) => ({
      isLeftSidebarOpen: !state.isLeftSidebarOpen,
      isToggling: true,
    }));
    // Drives the widened content column (`--width-content-max`, tokens.css).
    document.documentElement.dataset.sidebarHidden = String(!get().isLeftSidebarOpen);
    settleTimer = window.setTimeout(() => {
      settleTimer = null;
      set({ isToggling: false });
    }, SIDEBAR_TOGGLE_MS + TOGGLE_SETTLE_BUFFER_MS);
  },
}));
