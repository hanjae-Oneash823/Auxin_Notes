/** Grid sizes shared by the header, the sleep row and the habit rows. */
export const DAY_COL_PX = 30;
export const NAME_COL_PX = 210;
export const GOAL_COL_PX = 92;
export const NOW_COL_PX = 80;
export const ROW_PX = 36;
export const SLEEP_COLOR = '#7060e0';

/** Heat tint for a filled cell: the stronger the ratio, the more of the color shows. */
export const heat = (color: string, ratio: number): string => `color-mix(in srgb, ${color} ${15 + ratio * 75}%, transparent)`;

/** Red at 0 through green at 1, for the Now column. */
export const completionColor = (ratio: number): string => `hsl(${Math.round(Math.min(ratio, 1) * 145)}, 70%, 58%)`;
