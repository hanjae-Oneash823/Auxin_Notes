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

export const FONT_FAMILY_OPTIONS: FontFamilyOption[] = [
  {
    id: 'ibm-plex',
    label: 'IBM Plex Sans',
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    monoFontFamily: "'IBM Plex Mono', ui-monospace, monospace",
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
