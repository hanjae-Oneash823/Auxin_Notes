import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/**
 * Colors nested code-block syntax (see codeLanguages.ts) using the same
 * token palette as the rest of the app — deliberately a short list, not a
 * full VS Code-style rainbow, to match the app's restrained one-accent-per-
 * purpose look (cyan links, green tags) rather than introducing a clashing
 * fifth color family just for code.
 */
const auxinHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.modifier], color: 'var(--accent-link)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--accent-tag)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--accent-link-broken)' },
  { tag: tags.comment, color: 'var(--fg-faint)', fontStyle: 'italic' },
]);

export const auxinSyntaxHighlighting = syntaxHighlighting(auxinHighlightStyle);

/** How far a heading line sits left of the content column's normal edge.
 *  Exported so Editor.tsx's title field — visually a heading (large/bold,
 *  its own line) but a separate React `<textarea>`, not a `# ` markdown
 *  node this file's own decorations ever touch — can match it, instead of
 *  silently drifting out of sync as this value gets tuned. */
export const HEADING_LEFT_OFFSET_PX = '-32px';

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
      // Extra space below the last line so it can be scrolled up away from
      // the bottom edge instead of staying pinned there — CM6 otherwise
      // clamps scroll to the content's natural height.
      paddingBottom: 'var(--space-scroll-overscroll)',
      caretColor: 'var(--accent-caret)',
      maxWidth: '760px',
      margin: '0 auto',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent-caret)',
    },
    // Inverted (reverse-video) selection: a solid fg-colored background
    // layer (CM6 draws this separately from the text) paired with a
    // `::selection` rule that swaps the *text* to the bg color. CM6's own
    // base theme force-transparents `::selection`'s background-color with
    // `!important` (so it doesn't double up with this layer) but leaves
    // `color` alone, which is what makes the text-swap half possible here.
    // The `!important` here is needed too — CM6's base theme has its own
    // more specific `&dark.cm-focused > .cm-scroller > .cm-selectionLayer
    // .cm-selectionBackground` rule (`#233`) that otherwise wins while the
    // editor is focused, which is what was showing instead of this color.
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--color-fg) !important',
    },
    '.cm-content ::selection': {
      color: 'var(--color-bg)',
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
    // Bare `https://...` URLs (bareUrlPlugin.ts) — styled in place, not
    // replaced by a widget, since a URL is meant to stay readable/copyable
    // as text. `cursor: pointer` signals it's clickable even though opening
    // it is gated behind Cmd/Ctrl+click while editable (see that file).
    '.cm-bare-url': {
      color: 'var(--accent-link)',
      textDecoration: 'underline',
      cursor: 'pointer',
    },
    // Every line gets a small gap below it — this editor renders markdown
    // source close to as-typed (not fully-reflowed HTML), so without this a
    // line the user presses Enter on runs flush against the next with no
    // visual break at all, regardless of whether a blank line separates
    // them. Headings and lines inside a cohesive block (code fence,
    // callout) override this back to 0 below — the point is space between
    // otherwise-ordinary lines, not inside a block that should read as one
    // visual unit.
    //
    // `padding`, deliberately not `margin`: CodeMirror measures each
    // `.cm-line`'s own rendered height (which includes padding but not
    // margin) to build its internal line-position map, which arrow-key
    // up/down navigation and click-to-position both read from. A margin
    // here would open a real visual gap CodeMirror doesn't know about,
    // throwing that map out of sync with the actual pixels on screen —
    // arrow-down would then land a line early or late (worse the further
    // down a long note you are, since the drift accumulates).
    '.cm-line': { paddingBottom: 'var(--space-chrome-sm)' },
    '.cm-md-heading-1': { fontSize: '1.75em', fontWeight: '700' },
    '.cm-md-heading-2': { fontSize: '1.4em', fontWeight: '700' },
    '.cm-md-heading-3': { fontSize: '1.2em', fontWeight: '700' },
    '.cm-md-heading-4, .cm-md-heading-5, .cm-md-heading-6': { fontWeight: '700' },
    // `.cm-scroller`'s ambient line-height (1.6) is a multiplier of each
    // line's own font-size — on a heading's larger text that compounds into
    // a much bigger gap than the same ratio gives body text. Tighter,
    // heading-appropriate leading for the heading's own (possibly wrapped)
    // text; the gap *below* it is left to the default `.cm-line` padding
    // above, unless `.cm-md-heading-tight-below` overrides it (see
    // emitHeading) — a heading followed by ordinary text should get the
    // same gap as any other line, only a subheading directly beneath it
    // stays flush.
    '.cm-md-heading-line-1, .cm-md-heading-line-2, .cm-md-heading-line-3, .cm-md-heading-line-4, .cm-md-heading-line-5, .cm-md-heading-line-6':
      { lineHeight: '1.25' },
    // Extra room *above* a heading, scaled by level — this is what makes a
    // heading read as the start of a new section rather than just another
    // line: a bigger header pulls a bigger break from whatever preceded it.
    // The gap *below* stays the ordinary `.cm-line` padding (or 0 via
    // `.cm-md-heading-tight-below`) so the heading stays visually glued to
    // the content it introduces — asymmetric before/after spacing is the
    // whole point.
    '.cm-md-heading-line-1': { paddingTop: 'var(--space-content-md)' },
    '.cm-md-heading-line-2': { paddingTop: 'var(--space-content-sm)' },
    '.cm-md-heading-line-3, .cm-md-heading-line-4, .cm-md-heading-line-5, .cm-md-heading-line-6':
      { paddingTop: 'var(--space-chrome-md)' },
    // `.cm-content` already pads its top edge — a heading sitting right at
    // the start of the body (nothing before it but a folded frontmatter
    // block, or nothing at all) would otherwise stack its own before-gap on
    // top of that, landing further down than every other note's opening
    // line. Cancels back to flush with the content box's own top padding.
    '.cm-md-heading-first': { paddingTop: '0' },
    '.cm-md-heading-tight-below': { paddingBottom: '0' },
    // Small and muted deliberately — a marker that this line is a heading,
    // not a second focal point competing with the heading text itself.
    // `border-strong` is the same muted tone `.cm-md-mark` uses for the raw
    // `#`/`**`/etc. this icon is standing in for.
    // `marginLeft` lives on the icon widget itself, not on `.cm-line`
    // (where it visually belongs — pulling the whole heading line left of
    // the content column's normal edge, same as every other line's). It
    // used to be a `.cm-md-heading-line-N` line-decoration class, but CM6
    // silently drops a `Decoration.line()`'s class whenever that line is
    // the one immediately following a hidden `Decoration.replace({block:
    // true})` region — exactly the note's first heading, right after the
    // (always block-hidden) frontmatter. Confirmed with a plain list line
    // in the same position losing its own class the same way, so it's a
    // CM6 quirk, not something specific to headings. A negative margin on
    // this inline-block widget shifts it (and, since inline layout carries
    // the saved space forward, every inline sibling after it — the heading
    // text) left by the same amount, reproducing the old line-level effect
    // exactly, via a `Decoration.replace` widget the bug doesn't touch.
    '.cm-md-heading-icon': {
      display: 'inline-block',
      marginLeft: HEADING_LEFT_OFFSET_PX,
      marginRight: '5px',
      verticalAlign: 'middle',
      transform: 'translateY(-1px)',
      color: 'var(--border-strong)',
      cursor: 'pointer',
      transition: 'transform 120ms ease',
    },
    // Drawn pointing right at rest (collapsed); rotated to point down once
    // its section is open — one glyph, two orientations, rather than a
    // second "expanded" icon to keep in sync with the collapsed one.
    '.cm-md-heading-icon-expanded': { transform: 'translateY(-1px) rotate(90deg)' },
    '.cm-md-heading-icon svg': { display: 'block', width: '100%', height: '100%' },
    '.cm-md-heading-icon-1': { width: '14px', height: '14px' },
    '.cm-md-heading-icon-2': { width: '12px', height: '12px' },
    '.cm-md-heading-icon-3, .cm-md-heading-icon-4, .cm-md-heading-icon-5, .cm-md-heading-icon-6': {
      width: '11px',
      height: '11px',
    },
    '.cm-md-strong': { fontWeight: '700' },
    '.cm-md-emphasis': { fontStyle: 'italic' },
    '.cm-md-inline-code': {
      fontFamily: 'var(--font-family-mono)',
      backgroundColor: 'var(--border-subtle)',
      padding: '0 4px',
    },
    // No gap between lines within a single code block — code should read
    // as one continuous block, not a stack of individually-spaced lines.
    '.cm-md-codeblock-line': {
      backgroundColor: 'var(--border-subtle)',
      paddingBottom: '0',
    },
    // Tighter than the ordinary `.cm-line` gap (but not flush like a code
    // block) — a list's rows should read as one grouped unit, not stack up
    // with the same breathing room ordinary paragraphs get.
    '.cm-md-list-line': { paddingBottom: 'var(--space-chrome-xs)' },
    // Muted, same treatment as every other syntax marker this editor
    // styles down rather than leaving full-contrast — the bullet/number is
    // a list-structure cue, not content competing with the item's text.
    '.cm-md-list-bullet': { color: 'var(--fg-muted)' },
    '.cm-md-list-number': { color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' },
    // Extra room per nesting level on top of whatever raw indentation is
    // already in the source — makes nested lists read clearly as nested at
    // a glance instead of relying on the source's own (proportional-font,
    // inconsistent-looking) leading spaces alone.
    '.cm-md-list-depth-1': { paddingLeft: 'var(--space-chrome-md)' },
    '.cm-md-list-depth-2': { paddingLeft: 'calc(var(--space-chrome-md) * 2)' },
    '.cm-md-list-depth-3': { paddingLeft: 'calc(var(--space-chrome-md) * 3)' },
    '.cm-md-list-depth-4': { paddingLeft: 'calc(var(--space-chrome-md) * 4)' },
    '.cm-md-codeblock': {
      fontFamily: 'var(--font-family-mono)',
    },
    // Base box shape: thin left/right border always on, top/bottom off by
    // default — `.cm-callout-line-top`/`-bottom` (added only to the
    // callout's first/last line) switch those on, so multi-line callouts
    // get one border wrapping the whole block instead of every line.
    '.cm-callout-line': {
      borderStyle: 'solid',
      borderLeftWidth: '1px',
      borderRightWidth: '1px',
      borderTopWidth: '0',
      borderBottomWidth: '0',
      paddingLeft: '8px',
      paddingRight: '8px',
      // No gap between a callout's own wrapped lines — like a code block,
      // it should read as one bordered unit. `-bottom` below restores the
      // gap, but only after the block as a whole.
      paddingBottom: '0',
    },
    // Padding lives here, not on the base `.cm-callout-line` rule above —
    // that rule applies to every wrapped line in a multi-line callout, and
    // padding there would open a gap between each of them instead of just
    // at the box's actual top and bottom edges.
    '.cm-callout-line-top': { borderTopWidth: '1px', paddingTop: 'var(--space-chrome-xs)' },
    // Combines the callout box's own inner bottom inset (space-chrome-xs)
    // with the ordinary between-lines gap every line gets (space-chrome-sm,
    // see `.cm-line` above) into one `paddingBottom` — previously the latter
    // was a `marginBottom`, which is what has to stay padding for
    // CodeMirror's line-height accounting (and therefore arrow-key
    // navigation) to match what's actually on screen.
    '.cm-callout-line-bottom': {
      borderBottomWidth: '1px',
      paddingBottom: 'calc(var(--space-chrome-xs) + var(--space-chrome-sm))',
    },
    '.cm-callout-line-note': { backgroundColor: 'rgba(95, 208, 255, 0.08)', borderColor: 'var(--accent-link)' },
    '.cm-callout-line-tip': { backgroundColor: 'rgba(183, 255, 95, 0.08)', borderColor: 'var(--accent-tag)' },
    '.cm-callout-line-warning': { backgroundColor: 'rgba(255, 207, 95, 0.08)', borderColor: 'var(--accent-warning)' },
    '.cm-callout-line-danger': {
      backgroundColor: 'rgba(255, 107, 95, 0.08)',
      borderColor: 'var(--accent-link-broken)',
    },
    '.cm-callout-line-info': { backgroundColor: 'rgba(159, 143, 255, 0.08)', borderColor: 'var(--accent-info)' },
    // Deliberately NOT flex — a flex item ignores `vertical-align` entirely,
    // which is exactly why the two earlier attempts (a wrapper nudge, then
    // `vertical-align` on a flex child) only ever fixed the no-title case:
    // both relied on the wrapper's own box, which only has real text-driven
    // height there (the label sits inside it) — with a custom title, this
    // wrapper holds just the icon and the title is a separate sibling
    // decoration, so there's nothing for a flex-relative fix to anchor to.
    // Plain inline layout plus `vertical-align: middle` on the icon is
    // evaluated against the surrounding line box either way, so it's
    // consistent for both.
    '.cm-callout-icon-title': {},
    '.cm-callout-icon': {
      display: 'inline-block',
      width: '14px',
      height: '14px',
      marginRight: '5px',
      verticalAlign: 'middle',
      // `middle` alone still sits a hair low against this font — a pure
      // visual nudge on top of it, not a layout change, so it stays
      // consistent between the label-inside-widget and sibling-title cases.
      transform: 'translateY(-1px)',
    },
    '.cm-callout-icon svg': { display: 'block', width: '100%', height: '100%' },
    '.cm-callout-label': { fontWeight: '700' },
    '.cm-callout-title': { fontWeight: '700' },
    '.cm-callout-text-note': { color: 'var(--accent-link)' },
    '.cm-callout-text-tip': { color: 'var(--accent-tag)' },
    '.cm-callout-text-warning': { color: 'var(--accent-warning)' },
    '.cm-callout-text-danger': { color: 'var(--accent-link-broken)' },
    '.cm-callout-text-info': { color: 'var(--accent-info)' },
  },
  { dark: true },
);
