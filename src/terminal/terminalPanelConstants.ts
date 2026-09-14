// Kept out of TerminalPanel.tsx: a file exporting both a component and plain
// constants breaks Vite/React Fast Refresh's "consistent exports" check, so
// edits to TerminalPanel.tsx were silently failing to hot-reload (falling
// back to a full reload that itself failed) instead of applying live.
export const DEFAULT_PANEL_WIDTH = 640;
export const DEFAULT_PANEL_HEIGHT = 360;
export const MIN_PANEL_WIDTH = 320;
export const MIN_PANEL_HEIGHT = 200;
export const FONT_SIZE_OPTIONS = [11, 12, 13] as const;
export const DEFAULT_FONT_SIZE: (typeof FONT_SIZE_OPTIONS)[number] = 11;
