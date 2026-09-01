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
    id: 'ibm-plex',
    label: 'IBM Plex Sans',
    fontFamily: `'IBM Plex Sans', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  // Candidates below — all picked for legibility specifically, not looks.
  {
    id: 'atkinson-hyperlegible',
    label: 'Atkinson Hyperlegible',
    fontFamily: `'Atkinson Hyperlegible', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  {
    id: 'lexend',
    label: 'Lexend',
    fontFamily: `'Lexend', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
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
    id: 'public-sans',
    label: 'Public Sans',
    fontFamily: `'Public Sans', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  {
    id: 'work-sans',
    label: 'Work Sans',
    fontFamily: `'Work Sans', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  {
    id: 'noto-sans',
    label: 'Noto Sans',
    fontFamily: `'Noto Sans', ${KOREAN_FALLBACK}, ui-sans-serif, system-ui, sans-serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  {
    id: 'literata',
    label: 'Literata',
    fontFamily: `'Literata', ${KOREAN_FALLBACK}, ui-serif, Georgia, serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  {
    id: 'newsreader',
    label: 'Newsreader',
    fontFamily: `'Newsreader', ${KOREAN_FALLBACK}, ui-serif, Georgia, serif`,
    monoFontFamily: MONO_FALLBACK,
  },
  {
    id: 'spectral',
    label: 'Spectral',
    fontFamily: `'Spectral', ${KOREAN_FALLBACK}, ui-serif, Georgia, serif`,
    monoFontFamily: MONO_FALLBACK,
  },
];

export const DEFAULT_FONT_FAMILY_ID = FONT_FAMILY_OPTIONS[0].id;

export interface FontSizeOption {
  id: string;
  label: string;
  px: number;
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { id: 'small', label: 'Small', px: 16 },
  { id: 'medium', label: 'Medium', px: 18 },
  { id: 'large', label: 'Large', px: 20 },
];

export const DEFAULT_FONT_SIZE_ID = 'medium';

export function findFontFamily(id: string): FontFamilyOption {
  return FONT_FAMILY_OPTIONS.find((option) => option.id === id) ?? FONT_FAMILY_OPTIONS[0];
}

export function findFontSize(id: string): FontSizeOption {
  return FONT_SIZE_OPTIONS.find((option) => option.id === id) ?? FONT_SIZE_OPTIONS[0];
}
