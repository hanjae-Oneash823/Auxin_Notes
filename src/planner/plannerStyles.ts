/** Shared text/select input styling for the planner's forms. */
export const FIELD_CLASS =
  'w-full rounded-tab border border-border-subtle bg-bg-packet px-2.5 py-1.5 text-fg-prominent outline-none transition-colors duration-panel ease-panel placeholder:text-fg-faint focus:border-border-strong';

/** The flat background every dashboard panel sits on. */
export const PANEL_BACKGROUND = 'var(--color-dashboard-card-bg)';
/** A card's selected / hovered fill: opaque (page background nudged toward the text color), as on the dashboard's task cards. */
export const CARD_FILL_CLASS = 'bg-[color-mix(in_srgb,var(--color-bg)_92%,var(--color-fg)_8%)]';
export const CARD_HOVER_FILL_CLASS = 'hover:bg-[color-mix(in_srgb,var(--color-bg)_92%,var(--color-fg)_8%)]';

/** Small pill button; pair with CHIP_ON / CHIP_OFF for toggles. */
export const CHIP_BASE = 'rounded-tab border px-2 py-0.5 transition-colors duration-panel ease-panel';
export const CHIP_ON = 'border-border-strong bg-border-subtle text-fg-prominent';
export const CHIP_OFF = 'border-border-subtle text-fg-muted hover:text-fg-prominent';
