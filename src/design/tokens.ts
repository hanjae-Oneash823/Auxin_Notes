// Canonical design tokens for Auxin. This is the single source of truth for
// color/spacing/radius/typography/motion values — Tailwind config and the
// CodeMirror editor theme both consume tokens.css (generated from these values)
// rather than declaring their own copies. See tokens.css for the CSS custom
// property mirror consumed by Tailwind and inline styles.

export const colors = {
  bg: '#1A1A1C',
  fg: '#FFFFFF',
  fgOpacity: {
    faint: 0.35,
    muted: 0.62,
    prominent: 0.85,
    full: 1.0,
  },
  border: {
    subtle: 'rgba(255,255,255,0.09)',
    default: 'rgba(255,255,255,0.16)',
    strong: 'rgba(255,255,255,0.35)',
  },
  accent: {
    link: '#4DC8F2',
    linkBroken: '#C9776B',
    tag: '#ABE565',
    statusDot: '#6FAE85',
    caret: '#FFFFFF',
  },
} as const;

export const spacing = {
  chrome: { xs: 4, sm: 8, md: 12, lg: 16 },
  content: { sm: 16, md: 24, lg: 32 },
} as const;

// System law: no border-radius anywhere except circular status dots.
export const radius = { none: 0, full: '9999px' } as const;

export const typography = {
  fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
  monoFontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  baseSize: 18,
  // Dense chrome text (status bar) — see tokens.css's --font-size-chrome.
  chromeFontSize: '0.72rem',
  letterSpacing: { label: '1.5px', menu: '2px' },
} as const;

export const motion = {
  fast: '0.1s ease',
  snappy: '0.16s ease',
  press: '0.22s ease',
  panelEasing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  panelDuration: '0.3s',
} as const;

export const borders = { hairline: '1px solid' } as const;

export const shadow = { float: '0 2px 10px rgba(0, 0, 0, 0.4)' } as const;
