import { create } from 'zustand';
import { getAppConfig, patchAppConfig } from '../appConfig';
import {
  DEFAULT_FONT_FAMILY_ID,
  DEFAULT_FONT_SIZE_ID,
  findFontFamily,
  findFontSize,
} from '../../design/fontOptions';

interface SettingsState {
  fontFamilyId: string;
  fontSizeId: string;
  initFromConfig: () => Promise<void>;
  setFontFamily: (id: string) => Promise<void>;
  setFontSize: (id: string) => Promise<void>;
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
}));
