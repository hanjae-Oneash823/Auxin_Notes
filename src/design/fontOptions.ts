/**
 * Registry of selectable fonts/sizes — the single place a new option gets
 * added later. Everything else (settings store, CSS var application,
 * persistence) reads from this list rather than hardcoding a font.
 */
export interface FontFamilyOption {
  id: string;
  label: string;
  fontFamily: string;
  monoFontFamily: string;
}

const MONO_FALLBACK = "'IBM Plex Mono', ui-monospace, monospace";
// Every option below is a Latin-only face — none ship Hangul glyphs — so
// this goes right after each primary font name in the stack (see
// global.css for the actual @font-face imports, `korean-*` subset only).
const KOREAN_FALLBACK = "'Noto Sans KR'";

export const FONT_FAMILY_OPTIONS: FontFamilyOption[] = [
  {
    id: 'inter',
    label: 'Inter',
    fontFamily: `'Inter', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  {
    id: 'source-sans-3',
    label: 'Source Sans 3',
    fontFamily: `'Source Sans 3', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  {
    id: 'manrope',
    label: 'Manrope',
    fontFamily: `'Manrope', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  {
    id: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    fontFamily: `'Plus Jakarta Sans', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    fontFamily: `'DM Sans', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  {
    id: 'figtree',
    label: 'Figtree',
    fontFamily: `'Figtree', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
];

export const DEFAULT_FONT_FAMILY_ID = FONT_FAMILY_OPTIONS[0].id;

// A direct px value instead of named presets (small/medium/large) — lets a
// user dial in an exact size rather than picking from a handful of buckets.
export const FONT_SIZE_PX_MIN = 12;
export const FONT_SIZE_PX_MAX = 32;
export const DEFAULT_FONT_SIZE_PX = 18;

export function findFontFamily(id: string): FontFamilyOption {
  return FONT_FAMILY_OPTIONS.find((option) => option.id === id) ?? FONT_FAMILY_OPTIONS[0];
}

export function clampFontSizePx(px: number): number {
  return Math.min(FONT_SIZE_PX_MAX, Math.max(FONT_SIZE_PX_MIN, Math.round(px)));
}
