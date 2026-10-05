import { create } from 'zustand';
import { getAppConfig, patchAppConfig } from '../appConfig';
import { DEFAULT_CLOCK_RANGE, toClockRange, type ClockRange } from '../../clock/clockGeometry';
import {
  DEFAULT_FONT_FAMILY_ID,
  DEFAULT_FONT_SIZE_PX,
  clampFontSizePx,
  findFontFamily,
} from '../../design/fontOptions';

const DEFAULT_SIDEBAR_WIDTH_PX = 256;
export const DEFAULT_THEME_ID = 'dark';

interface SettingsState {
  fontFamilyId: string;
  fontSizePx: number;
  themeId: string;
  /** '' means unset — HomeDashboard hides its greeting in that case. */
  userName: string;
  /** How much time the top clock strip shows. */
  clockRange: ClockRange;
  initFromConfig: () => Promise<void>;
  setFontFamily: (id: string) => Promise<void>;
  setFontSize: (px: number) => Promise<void>;
  setTheme: (id: string) => Promise<void>;
  setUserName: (name: string) => Promise<void>;
  setClockRange: (range: ClockRange) => Promise<void>;
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
function applyFont(fontFamilyId: string, fontSizePx: number): void {
  const family = findFontFamily(fontFamilyId);
  const root = document.documentElement.style;
  root.setProperty('--font-family', family.fontFamily);
  root.setProperty('--font-family-mono', family.monoFontFamily);
  root.setProperty('--font-size-base', `${fontSizePx}px`);
}

/** `data-theme` (not a CSS var override like `applyFont`) — tokens.css keys
 *  its whole light palette off `[data-theme="light"]` in one place, so
 *  every token flips together rather than this needing to know what each
 *  one is. */
function applyTheme(themeId: string): void {
  document.documentElement.dataset.theme = themeId;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  fontFamilyId: DEFAULT_FONT_FAMILY_ID,
  fontSizePx: DEFAULT_FONT_SIZE_PX,
  themeId: DEFAULT_THEME_ID,
  userName: '',
  clockRange: DEFAULT_CLOCK_RANGE,

  initFromConfig: async () => {
    const config = await getAppConfig();
    const fontFamilyId = config.font_family_id ?? DEFAULT_FONT_FAMILY_ID;
    const fontSizePx = config.font_size_px ?? DEFAULT_FONT_SIZE_PX;
    const themeId = config.theme_id ?? DEFAULT_THEME_ID;
    const userName = config.user_name ?? '';
    applyFont(fontFamilyId, fontSizePx);
    applyTheme(themeId);
    set({ fontFamilyId, fontSizePx, themeId, userName, clockRange: toClockRange(config.clock_range) });

    const root = document.documentElement.style;
    root.setProperty('--width-sidebar-left', `${config.sidebar_width_left ?? DEFAULT_SIDEBAR_WIDTH_PX}px`);
    root.setProperty('--width-sidebar-right', `${config.sidebar_width_right ?? DEFAULT_SIDEBAR_WIDTH_PX}px`);
  },

  setFontFamily: async (id: string) => {
    applyFont(id, get().fontSizePx);
    set({ fontFamilyId: id });
    await patchAppConfig({ font_family_id: id });
  },

  setFontSize: async (px: number) => {
    const clamped = clampFontSizePx(px);
    applyFont(get().fontFamilyId, clamped);
    set({ fontSizePx: clamped });
    await patchAppConfig({ font_size_px: clamped });
  },

  setTheme: async (id: string) => {
    applyTheme(id);
    set({ themeId: id });
    await patchAppConfig({ theme_id: id });
  },

  setUserName: async (name: string) => {
    const trimmed = name.trim();
    set({ userName: trimmed });
    await patchAppConfig({ user_name: trimmed || null });
  },

  setClockRange: async (range: ClockRange) => {
    set({ clockRange: range });
    await patchAppConfig({ clock_range: range });
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
