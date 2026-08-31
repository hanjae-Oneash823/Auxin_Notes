import { EditorView } from '@codemirror/view';

/**
 * CM6 theme sourced entirely from the design tokens (via their CSS custom
 * property mirror in tokens.css) — no hardcoded colors here, matching the
 * "one canonical source" rule the token system exists to enforce.
 */
export const auxinEditorTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--color-fg)',
      backgroundColor: 'var(--color-bg)',
      fontFamily: 'var(--font-family)',
      fontSize: 'var(--font-size-base)',
      height: '100%',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-content': {
      padding: 'var(--space-content-md) var(--space-content-lg)',
      caretColor: 'var(--accent-caret)',
      maxWidth: '760px',
      margin: '0 auto',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent-caret)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--border-default)',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-family)',
      lineHeight: '1.6',
      scrollbarWidth: 'none',
    },
    // Main editing area only — scoped to `.cm-scroller` so every other
    // scrollbar (sidebar, panels) keeps the app-wide dark-themed style.
    '.cm-scroller::-webkit-scrollbar': {
      display: 'none',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    // Markdown syntax marks, shown only while the cursor is on that line —
    // muted "meta" color so raw ** # [[ ]] read as punctuation, not content.
    '.cm-md-mark': {
      color: 'var(--border-strong)',
    },
    '.cm-md-heading-1': { fontSize: '1.6em', fontWeight: '700' },
    '.cm-md-heading-2': { fontSize: '1.4em', fontWeight: '700' },
    '.cm-md-heading-3': { fontSize: '1.2em', fontWeight: '700' },
    '.cm-md-heading-4, .cm-md-heading-5, .cm-md-heading-6': { fontWeight: '700' },
    '.cm-md-strong': { fontWeight: '700' },
    '.cm-md-emphasis': { fontStyle: 'italic' },
    '.cm-md-inline-code': {
      fontFamily: 'var(--font-family-mono)',
      backgroundColor: 'var(--border-subtle)',
      padding: '0 4px',
    },
  },
  { dark: true },
);
