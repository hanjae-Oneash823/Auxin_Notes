import { create } from 'zustand';
import { getAppConfig, patchAppConfig } from '../appConfig';
import {
  DEFAULT_FONT_FAMILY_ID,
  DEFAULT_FONT_SIZE_ID,
  findFontFamily,
  findFontSize,
} from '../../design/fontOptions';

const DEFAULT_SIDEBAR_WIDTH_PX = 256;

interface SettingsState {
  fontFamilyId: string;
  fontSizeId: string;
  initFromConfig: () => Promise<void>;
  setFontFamily: (id: string) => Promise<void>;
  setFontSize: (id: string) => Promise<void>;
  setSidebarWidthLeft: (widthPx: number) => Promise<void>;
  setSidebarWidthRight: (widthPx: number) => Promise<void>;
}

/** Applies the resolved font choice as CSS custom properties on the root
 *  element — every consumer (Tailwind's `font-sans`/`font-mono`, the CM6
 *  theme, widget inline styles) already reads `var(--font-family)` /
 *  `var(--font-family-mono)` / `var(--font-size-base)`, so changing these
 *  three properties is all a live font switch needs; nothing has to be
 *  told to re-render. tokens.css's own values are just the pre-JS default
 *  (and happen to match this module's defaults, so there's no flash on a
 *  fresh install before this runs). */
function applyFont(fontFamilyId: string, fontSizeId: string): void {
  const family = findFontFamily(fontFamilyId);
  const size = findFontSize(fontSizeId);
  const root = document.documentElement.style;
  root.setProperty('--font-family', family.fontFamily);
  root.setProperty('--font-family-mono', family.monoFontFamily);
  root.setProperty('--font-size-base', `${size.px}px`);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  fontFamilyId: DEFAULT_FONT_FAMILY_ID,
  fontSizeId: DEFAULT_FONT_SIZE_ID,

  initFromConfig: async () => {
    const config = await getAppConfig();
    const fontFamilyId = config.font_family_id ?? DEFAULT_FONT_FAMILY_ID;
    const fontSizeId = config.font_size_id ?? DEFAULT_FONT_SIZE_ID;
    applyFont(fontFamilyId, fontSizeId);
    set({ fontFamilyId, fontSizeId });

    const root = document.documentElement.style;
    root.setProperty('--width-sidebar-left', `${config.sidebar_width_left ?? DEFAULT_SIDEBAR_WIDTH_PX}px`);
    root.setProperty('--width-sidebar-right', `${config.sidebar_width_right ?? DEFAULT_SIDEBAR_WIDTH_PX}px`);
  },

  setFontFamily: async (id: string) => {
    applyFont(id, get().fontSizeId);
    set({ fontFamilyId: id });
    await patchAppConfig({ font_family_id: id });
  },

  setFontSize: async (id: string) => {
    applyFont(get().fontFamilyId, id);
    set({ fontSizeId: id });
    await patchAppConfig({ font_size_id: id });
  },

  // No local state for either — nothing reactively displays the panel
  // width (unlike font, which drives SettingsPanel's picker); the CSS var
  // ResizeHandle already set live during the drag is the only UI that
  // needs it, this just persists the final value.
  setSidebarWidthLeft: async (widthPx: number) => {
    await patchAppConfig({ sidebar_width_left: widthPx });
  },

  setSidebarWidthRight: async (widthPx: number) => {
    await patchAppConfig({ sidebar_width_right: widthPx });
  },
}));
