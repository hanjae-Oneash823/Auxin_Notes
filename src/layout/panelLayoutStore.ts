import { create } from 'zustand';
import { getAppConfig, patchAppConfig } from '../app/appConfig';

/** How long the show/hide width transition runs, shared by everything that
 *  animates with it (the sidebars themselves and the header's label block). */
export const SIDEBAR_TOGGLE_MS = 220;
export const SIDEBAR_TOGGLE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
// Small buffer past the transition so `isToggling` never clears mid-animation.
const TOGGLE_SETTLE_BUFFER_MS = 40;

export const RIGHT_PANEL_LAYERS = ['files', 'search', 'tags', 'contents', 'links'] as const;
export type RightPanelLayer = (typeof RIGHT_PANEL_LAYERS)[number];
const DEFAULT_RIGHT_LAYER: RightPanelLayer = 'files';

export type SidebarSide = 'left' | 'right';

function isRightPanelLayer(value: unknown): value is RightPanelLayer {
  return RIGHT_PANEL_LAYERS.some((layer) => layer === value);
}

interface PanelLayoutState {
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
  activeRightLayer: RightPanelLayer;
  /** True only while a show/hide is animating. The width transition is gated
   *  on this because the same CSS width var is written live by the resize
   *  drag — a permanent transition would make dragging lag behind the
   *  pointer. */
  isToggling: boolean;
  toggleSidebar: (side: SidebarSide) => void;
  setRightLayer: (layer: RightPanelLayer) => void;
  /** Restores the persisted layout — call once at startup. No animation. */
  initFromConfig: () => Promise<void>;
}

let settleTimer: number | null = null;

/** Drives the widened content column (`--width-content-max`, tokens.css). */
function applyHiddenAttributes(isLeftOpen: boolean, isRightOpen: boolean): void {
  const root = document.documentElement.dataset;
  root.leftHidden = String(!isLeftOpen);
  root.rightHidden = String(!isRightOpen);
}

function persist(patch: Parameters<typeof patchAppConfig>[0]): void {
  patchAppConfig(patch).catch((error: unknown) => {
    console.error('Failed to save panel layout', error);
  });
}

/** Panel layout state: which sidebars are shown and which layer the right
 *  panel displays. Its own store (not App state) because the toggles live in
 *  `TitleBar` while the panels they control are rendered from `VaultReady` —
 *  siblings with no shared parent state between them. */
export const usePanelLayoutStore = create<PanelLayoutState>((set, get) => ({
  isLeftSidebarOpen: true,
  isRightSidebarOpen: true,
  activeRightLayer: DEFAULT_RIGHT_LAYER,
  isToggling: false,

  toggleSidebar: (side) => {
    if (settleTimer !== null) window.clearTimeout(settleTimer);
    set((state) =>
      side === 'left'
        ? { isLeftSidebarOpen: !state.isLeftSidebarOpen, isToggling: true }
        : { isRightSidebarOpen: !state.isRightSidebarOpen, isToggling: true },
    );
    const { isLeftSidebarOpen, isRightSidebarOpen } = get();
    applyHiddenAttributes(isLeftSidebarOpen, isRightSidebarOpen);
    persist({ left_sidebar_hidden: !isLeftSidebarOpen, right_sidebar_hidden: !isRightSidebarOpen });
    settleTimer = window.setTimeout(() => {
      settleTimer = null;
      set({ isToggling: false });
    }, SIDEBAR_TOGGLE_MS + TOGGLE_SETTLE_BUFFER_MS);
  },

  setRightLayer: (layer) => {
    set({ activeRightLayer: layer });
    persist({ right_panel_layer: layer });
  },

  initFromConfig: async () => {
    const config = await getAppConfig();
    const isLeftSidebarOpen = config.left_sidebar_hidden !== true;
    const isRightSidebarOpen = config.right_sidebar_hidden !== true;
    const activeRightLayer = isRightPanelLayer(config.right_panel_layer) ? config.right_panel_layer : DEFAULT_RIGHT_LAYER;
    applyHiddenAttributes(isLeftSidebarOpen, isRightSidebarOpen);
    set({ isLeftSidebarOpen, isRightSidebarOpen, activeRightLayer });
  },
}));
