import type { ITheme } from '@xterm/xterm';

// Literal hex throughout, not var(--...) — xterm's theme is consumed by its
// own renderer, which can't resolve CSS custom properties.

/** The terminal's background never changes with the theme. Matches
 *  tokens.css's --color-packet-bg (the right-panel packet it sits in). */
export const TERMINAL_BG = '#1b1b1e';

type ThemeColors = Omit<ITheme, 'background' | 'cursorAccent'>;

export interface TerminalThemeOption {
  id: string;
  label: string;
  /** The dot shown in the picker. */
  swatch: string;
  colors: ThemeColors;
}

export const TERMINAL_THEMES: readonly TerminalThemeOption[] = [
  {
    // Built from the app's own accents (tokens.css), so the terminal matches the UI.
    id: 'auxin',
    label: 'Auxin',
    swatch: '#4dc8f2',
    colors: {
      foreground: '#d9d9db',
      cursor: '#4dc8f2',
      selectionBackground: 'rgba(77, 200, 242, 0.25)',
      black: '#3a3a40',
      red: '#c9776b',
      green: '#abe565',
      yellow: '#e9bc61',
      blue: '#4dc8f2',
      magenta: '#8b82be',
      cyan: '#6fcf9e',
      white: '#d9d9db',
      brightBlack: '#6b6b73',
      brightRed: '#dd8e82',
      brightGreen: '#c3ee85',
      brightYellow: '#f2cd80',
      brightBlue: '#7dd6f7',
      brightMagenta: '#a49bd0',
      brightCyan: '#8ddbb4',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'catppuccin',
    label: 'Catppuccin Mocha',
    swatch: '#cba6f7',
    colors: {
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: 'rgba(203, 166, 247, 0.25)',
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#6c7086',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8',
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    swatch: '#88c0d0',
    colors: {
      foreground: '#d8dee9',
      cursor: '#d8dee9',
      selectionBackground: 'rgba(136, 192, 208, 0.25)',
      black: '#3b4252',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',
      // Lifted from Nord's #4c566a so dim text stays readable on this background.
      brightBlack: '#616e88',
      brightRed: '#bf616a',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4',
    },
  },
  {
    // One hue only (the app's neon green): errors and diffs lose their color
    // coding, by design.
    id: 'phosphor',
    label: 'Phosphor',
    swatch: '#b7ff5f',
    colors: {
      foreground: '#b7ff5f',
      cursor: '#b7ff5f',
      selectionBackground: 'rgba(183, 255, 95, 0.22)',
      black: '#23301a',
      red: '#86b23f',
      green: '#b7ff5f',
      yellow: '#d4ff8f',
      blue: '#6f9f35',
      magenta: '#9bd048',
      cyan: '#a6e878',
      white: '#dfffb5',
      brightBlack: '#5a7a33',
      brightRed: '#a3cf5a',
      brightGreen: '#cfff8a',
      brightYellow: '#e6ffb0',
      brightBlue: '#8bbf47',
      brightMagenta: '#b6e564',
      brightCyan: '#c0f593',
      brightWhite: '#f2ffdb',
    },
  },
];

export const DEFAULT_THEME_ID = TERMINAL_THEMES[0].id;

export function isTerminalThemeId(value: unknown): value is string {
  return TERMINAL_THEMES.some((theme) => theme.id === value);
}

/** The full xterm theme for an id (unknown ids fall back to the default). */
export function getTerminalTheme(id: string): ITheme {
  const option = TERMINAL_THEMES.find((theme) => theme.id === id) ?? TERMINAL_THEMES[0];
  // overviewRulerBorder: the 1px line xterm draws down the scrollbar's left
  // edge — matching the background makes it invisible.
  return { ...option.colors, background: TERMINAL_BG, cursorAccent: TERMINAL_BG, overviewRulerBorder: TERMINAL_BG };
}
