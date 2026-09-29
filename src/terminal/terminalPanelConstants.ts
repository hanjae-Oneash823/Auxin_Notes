// Kept out of the component files: a file exporting both a component and plain
// constants breaks Vite/React Fast Refresh's "consistent exports" check.
export const FONT_SIZE_OPTIONS = [11, 12, 13] as const;
export const DEFAULT_FONT_SIZE: (typeof FONT_SIZE_OPTIONS)[number] = 11;
