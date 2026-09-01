/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        fg: {
          DEFAULT: 'var(--color-fg)',
          faint: 'rgba(255, 255, 255, var(--fg-opacity-faint))',
          muted: 'rgba(255, 255, 255, var(--fg-opacity-muted))',
          prominent: 'rgba(255, 255, 255, var(--fg-opacity-prominent))',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        accent: {
          link: 'var(--accent-link)',
          'link-broken': 'var(--accent-link-broken)',
          tag: 'var(--accent-tag)',
          'status-dot': 'var(--accent-status-dot)',
          caret: 'var(--accent-caret)',
        },
      },
      fontFamily: {
        sans: ['var(--font-family)'],
        mono: ['var(--font-family-mono)'],
        brand: ['var(--font-family-brand)'],
      },
      fontSize: {
        base: 'var(--font-size-base)',
      },
      letterSpacing: {
        label: 'var(--letter-spacing-label)',
        menu: 'var(--letter-spacing-menu)',
      },
      width: {
        rail: 'var(--width-rail)',
      },
      transitionTimingFunction: {
        panel: 'var(--ease-panel)',
      },
      transitionDuration: {
        panel: 'var(--duration-panel)',
      },
    },
    // System law: no border-radius anywhere except circular status dots.
    // Replaced (not extended) so no component can reach for a scale value
    // (rounded-md, rounded-lg, ...) that shouldn't exist in this app.
    borderRadius: {
      none: 'var(--radius-none)',
      full: 'var(--radius-full)',
    },
  },
  plugins: [],
};
