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

/** How far a heading line sits left of the content column's normal edge —
 *  0, so headings align flush with body text rather than outdenting past
 *  it. Exported so Editor.tsx's title field — visually a heading
 *  (large/bold, its own line) but a separate React `<textarea>`, not a `# `
 *  markdown node this file's own decorations ever touch — can match it,
 *  instead of silently drifting out of sync as this value gets tuned. */
export const HEADING_LEFT_OFFSET_PX = '0px';

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
      maxWidth: 'var(--width-content-max)',
      transition: 'var(--transition-content-width)',
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
      // Tighter than Notion's own 1.5 — deliberately, so a paragraph's
      // wrapped rows sit close together while the *break* between separate
      // paragraphs (space-line-gap below) reads as the more distinct jump,
      // rather than the two being close to each other in scale.
      lineHeight: '1.4',
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
    // `[text](url)` markdown links (markdownLinkPlugin.ts) — same treatment
    // as a bare URL, just applied to the label instead of the raw href,
    // since the `](url)` portion itself is hidden rather than shown.
    '.cm-md-link': {
      color: 'var(--accent-link)',
      textDecoration: 'underline',
      cursor: 'pointer',
    },
    // TeX rendered via KaTeX (mathPlugin.ts). Inline math sits on the text
    // baseline like any other inline element; block math gets its own
    // centered row with a little breathing room, same spirit as the image
    // widget's `outer`/centering wrapper.
    '.cm-md-math-inline': {
      color: 'var(--color-fg)',
    },
    '.cm-md-math-block': {
      display: 'block',
      textAlign: 'center',
      margin: '5px 0',
      color: 'var(--color-fg)',
    },
    '.cm-md-math-error': {
      color: 'var(--accent-link-broken)',
      fontFamily: 'var(--font-family-mono)',
      fontSize: '0.85em',
    },
    // GFM tables (tablePlugin.ts). `overflowX: auto` on the outer wrapper,
    // not the table itself, so a table wider than the content column scrolls
    // horizontally in place rather than blowing out the editor's own layout.
    '.cm-md-table-outer': {
      margin: '5px 0',
      overflowX: 'auto',
    },
    '.cm-md-table': {
      borderCollapse: 'collapse',
      width: '100%',
      fontSize: '0.9em',
    },
    '.cm-md-table th, .cm-md-table td': {
      border: '1px solid var(--border-subtle)',
      padding: '6px 10px',
      verticalAlign: 'top',
    },
    '.cm-md-table th': {
      fontWeight: '700',
      color: 'var(--fg-prominent)',
      borderBottomColor: 'var(--border-default)',
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
    // Sized to `--space-line-gap`, not the general-purpose `--space-chrome-*`
    // tokens UI chrome uses elsewhere — deliberately wide relative to the
    // tightened line-height above, so a paragraph break reads as a clearly
    // distinct jump rather than close in scale to the gap between a
    // paragraph's own wrapped rows.
    //
    // `padding`, deliberately not `margin`: CodeMirror measures each
    // `.cm-line`'s own rendered height (which includes padding but not
    // margin) to build its internal line-position map, which arrow-key
    // up/down navigation and click-to-position both read from. A margin
    // here would open a real visual gap CodeMirror doesn't know about,
    // throwing that map out of sync with the actual pixels on screen —
    // arrow-down would then land a line early or late (worse the further
    // down a long note you are, since the drift accumulates).
    '.cm-line': { paddingBottom: 'var(--space-line-gap)' },
    '.cm-md-heading-1': { fontSize: '1.75em', fontWeight: '700' },
    '.cm-md-heading-2': { fontSize: '1.4em', fontWeight: '700' },
    '.cm-md-heading-3': { fontSize: '1.2em', fontWeight: '700' },
    '.cm-md-heading-4, .cm-md-heading-5, .cm-md-heading-6': { fontWeight: '700' },
    // `.cm-scroller`'s ambient line-height (1.6) is a multiplier of each
    // line's own font-size — on a heading's larger text that compounds into
    // a much bigger gap than the same ratio gives body text. Tighter,
    // heading-appropriate leading for the heading's own (possibly wrapped)
    // text; the gap *below* it comes from `--space-line-gap-heading` below,
    // unless `.cm-md-heading-tight-below` overrides it to 0 (see
    // emitHeading) — a heading followed by ordinary text gets its own
    // (larger-than-paragraph) after-space, but a subheading directly
    // beneath it stays flush.
    // `marginLeft` lives here (block-level, so it applies to *every* wrapped
    // visual row of the heading, not just the first) rather than on the icon
    // widget alone — a negative margin on an inline child only shifts its
    // own row; a wrapped second line has no icon on it and would otherwise
    // fall back to the unshifted body-text column, misaligned from line one.
    // This does re-open a known CM6 quirk this app has hit before (a
    // Decoration.line()'s class can be silently dropped on the line right
    // after a hidden block region — e.g. a just-collapsed heading section —
    // see the historical note on `.cm-md-heading-icon` below), but
    // `paddingTop`/`lineHeight` already ride the same class today with no
    // reported issue, so this isn't taking on new risk beyond what already
    // exists. `lineHeight` tightened from 1.6-multiplied-of-heading-size
    // (1.25) to 1.15 — a wrapped heading's own rows were sitting further
    // apart than the heading's size actually called for.
    '.cm-md-heading-line-1, .cm-md-heading-line-2, .cm-md-heading-line-3, .cm-md-heading-line-4, .cm-md-heading-line-5, .cm-md-heading-line-6':
      { lineHeight: '1.15', marginLeft: HEADING_LEFT_OFFSET_PX },
    // Extra room *above and below* a heading, both scaled by level — a
    // bigger header pulls a bigger break on both sides, though before stays
    // the dominant gap at every level (see the --space-line-gap-heading-*
    // comment in tokens.css) so a header still reads as glued to the
    // content it introduces rather than centered between two equal gaps.
    // `.cm-md-heading-tight-below` (below) still overrides paddingBottom to
    // 0 when a subheading follows directly — that stays flush regardless.
    '.cm-md-heading-line-1': { paddingTop: 'var(--space-content-xl)', paddingBottom: 'var(--space-line-gap-heading-1)' },
    '.cm-md-heading-line-2': { paddingTop: 'var(--space-content-lg)', paddingBottom: 'var(--space-line-gap-heading-2)' },
    '.cm-md-heading-line-3, .cm-md-heading-line-4, .cm-md-heading-line-5, .cm-md-heading-line-6':
      { paddingTop: 'var(--space-content-md)', paddingBottom: 'var(--space-line-gap-heading-3)' },
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
    // `marginLeft` used to live here rather than on `.cm-md-heading-line-N`
    // (see that rule above for why, and for the CM6 dropped-class quirk this
    // sidestepped — confirmed with a plain list line losing its own class
    // the same way, so it's a general CM6 quirk, not heading-specific).
    // Moved to the line class so a wrapped heading's second+ row gets the
    // same left offset as its first, which an inline widget's own margin
    // can never reach across a soft-wrap.
    '.cm-md-heading-icon': {
      display: 'inline-block',
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
    // `marginLeft` here is the icon's own width + the shared 5px
    // `marginRight` above, negated — a hanging-gutter technique: it pulls
    // the icon fully out of the inline flow so the text right after it
    // isn't pushed rightward by the icon's footprint. Without this, line
    // 1's text starts `marginLeft` further right than every wrapped row
    // below it (which has no icon eating into that space), making a
    // multi-line heading's continuation lines hang further left than its
    // own first line instead of lining up with it.
    '.cm-md-heading-icon-1': { width: '14px', height: '14px', marginLeft: '-19px' },
    '.cm-md-heading-icon-2': { width: '12px', height: '12px', marginLeft: '-17px' },
    '.cm-md-heading-icon-3, .cm-md-heading-icon-4, .cm-md-heading-icon-5, .cm-md-heading-icon-6': {
      width: '11px',
      height: '11px',
      marginLeft: '-16px',
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
    //
    // `paddingLeft`/`textIndent` together are the standard hanging-indent
    // trick: the marker+gap (bullet width 9px + its 8px marginRight, see
    // cm-md-list-bullet) only offsets line 1's *inline* content — a
    // soft-wrapped continuation row of that same source line otherwise
    // falls back to the block's own left edge, landing flush with the
    // bullet instead of under line 1's text. Reserving that same 17px as
    // padding, then pulling line 1 back by the same amount via a negative
    // text-indent (which, unlike padding, only ever affects a block's first
    // line), makes every row — wrapped or not — line up at one column.
    // `margin-left` on `.cm-md-list-depth-N` below adds nesting indent on
    // top of this without fighting it for the same `padding-left` property.
    '.cm-md-list-line': { paddingBottom: 'var(--space-line-gap-list)', paddingLeft: '17px', textIndent: '-17px' },
    // An ordered item's marker+gap footprint is wider than a bullet's (see
    // cm-md-list-number's own comment: 20px numeral column + 6px gap = 26px,
    // vs. the bullet's 17px) — overrides the hanging-indent pair above to
    // match, so a numbered list's wrapped rows land under its own text
    // instead of a bullet-sized indent that's too narrow for its marker.
    '.cm-md-list-line-ordered': { paddingLeft: '26px', textIndent: '-26px' },
    // The line right before non-list content follows (see emitListItemLines
    // in hideSyntaxPlugin.ts) — falls back to the ordinary paragraph gap so
    // leaving a list reads as a real block break, not a jump cut straight
    // from the list's own tight internal rhythm.
    // Its own token, not --space-line-gap (the ordinary paragraph gap) —
    // slightly more than a plain paragraph break, so leaving a list reads
    // as a slightly more deliberate block break, without also inflating
    // ordinary paragraph-to-paragraph spacing everywhere else.
    '.cm-md-list-line-last': { paddingBottom: 'var(--space-content-sm)' },
    // Full-contrast, not muted — Notion's own bullets are solid, same
    // color as the item's text, and read as a clear anchor for each item;
    // a muted bullet at small size read as a faint mark rather than a
    // bullet once compared side by side against that.
    //
    // Fixed pixel box + `vertical-align`/`transform` nudge, the same
    // precise-positioning approach `.cm-md-heading-icon`/`.cm-callout-icon`
    // already use — the SVG shape (ListBulletWidget in hideSyntaxPlugin.ts)
    // is drawn to fill this box exactly, so it sits consistently centered on
    // the text's x-height regardless of font, instead of drifting with
    // whatever a `•` glyph's own baseline/size happens to be in the active
    // font. Width/height/marginRight live on the depth-scoped classes below,
    // not here, so depth is legible from icon size too.
    '.cm-md-list-bullet': {
      display: 'inline-block',
      verticalAlign: 'middle',
      transform: 'translateY(-1px)',
      color: 'var(--color-fg)',
    },
    '.cm-md-list-bullet svg': { display: 'block', width: '100%', height: '100%' },
    // Icon shrinks a px per level while `width + marginRight` is kept at a
    // constant 17px total across all five — that sum is exactly what
    // `.cm-md-list-line`'s `padding-left`/`text-indent` hanging-indent above
    // reserves, so varying the size split between icon and gap (rather than
    // the total) keeps every depth's wrapped-line alignment exact instead of
    // drifting a few px at deeper nesting.
    '.cm-md-list-bullet-depth-0': { width: '9px', height: '9px', marginRight: '8px' },
    '.cm-md-list-bullet-depth-1': { width: '8px', height: '8px', marginRight: '9px' },
    '.cm-md-list-bullet-depth-2': { width: '7px', height: '7px', marginRight: '10px' },
    '.cm-md-list-bullet-depth-3': { width: '6px', height: '6px', marginRight: '11px' },
    '.cm-md-list-bullet-depth-4': { width: '5px', height: '5px', marginRight: '12px' },
    // Same controlled gap as the bullet above, now that hideSyntaxPlugin.ts
    // hides the raw space after the marker for both — an ordered list's
    // digits shouldn't sit any closer to their text than a bullet does.
    //
    // Fixed `width` + `text-align: right` (not just a `marginRight`, unlike
    // the bullet) — a numeral's own width varies with digit count ("1." vs
    // "12."), and without a reserved column that variation would show up as
    // one item's text starting further right than another's. Right-aligning
    // within that fixed column keeps the *gap* before the text constant
    // regardless of digit count — the numbers themselves fan out to the
    // left instead, same as a conventional `<ol>`. 20px comfortably fits
    // two digits at this font/size; a three-digit list (rare) would clip.
    '.cm-md-list-number': {
      display: 'inline-block',
      width: '20px',
      textAlign: 'right',
      color: 'var(--fg-muted)',
      fontVariantNumeric: 'tabular-nums',
      marginRight: '6px',
    },
    // Sole source of nesting indent — emitListMark in hideSyntaxPlugin.ts
    // now hides each item's raw leading whitespace outright, so unlike
    // before this isn't stacked on top of the source's own indentation; it
    // IS the indentation, which is what makes it a fixed, predictable step
    // per level instead of drifting with whatever whitespace happens to be
    // in the source.
    //
    // `margin`, not `padding` — `.cm-md-list-line` above already owns
    // `padding-left` for the bullet's hanging indent; a second `padding-left`
    // here would simply overwrite it (same declaration, same element) rather
    // than stack. Margin shifts the whole box (bullet included) right by
    // the nesting step without touching that reserved padding, so the
    // hanging indent still lines up correctly at every depth.
    //
    // Every depth — 0 included — carries `--space-list-indent-base`, so a
    // top-level list still reads as set off from surrounding paragraph text
    // instead of flush with it; deeper levels add the usual per-level step
    // on top of that same base, rather than starting fresh from 0.
    '.cm-md-list-depth-0': { marginLeft: 'var(--space-list-indent-base)' },
    '.cm-md-list-depth-1': { marginLeft: 'calc(var(--space-list-indent-base) + var(--space-list-indent))' },
    '.cm-md-list-depth-2': { marginLeft: 'calc(var(--space-list-indent-base) + var(--space-list-indent) * 2)' },
    '.cm-md-list-depth-3': { marginLeft: 'calc(var(--space-list-indent-base) + var(--space-list-indent) * 3)' },
    '.cm-md-list-depth-4': { marginLeft: 'calc(var(--space-list-indent-base) + var(--space-list-indent) * 4)' },
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
    // A slight inner inset above the callout's own first line — this can't
    // be a `margin` (same CodeMirror line-height/arrow-key constraint as
    // `.cm-line` above), so it's not literally outside the border, but at
    // this low a background opacity it reads as breathing room rather than
    // box padding. Bumped from space-chrome-xs to space-chrome-sm to give a
    // touch more room than the bare minimum.
    '.cm-callout-line-top': { borderTopWidth: '1px', paddingTop: 'var(--space-chrome-sm)' },
    // Combines the callout box's own inner bottom inset (space-chrome-sm,
    // matching `-top` above) with the ordinary between-lines gap every line
    // gets (space-line-gap, see `.cm-line` above) into one `paddingBottom` —
    // previously the latter was a `marginBottom`, which is what has to stay
    // padding for CodeMirror's line-height accounting (and therefore
    // arrow-key navigation) to match what's actually on screen.
    '.cm-callout-line-bottom': {
      borderBottomWidth: '1px',
      paddingBottom: 'calc(var(--space-chrome-sm) + var(--space-line-gap))',
    },
    '.cm-callout-line-note': { backgroundColor: 'rgba(77, 200, 242, 0.08)', borderColor: 'var(--accent-link)' },
    '.cm-callout-line-tip': { backgroundColor: 'rgba(171, 229, 101, 0.08)', borderColor: 'var(--accent-tag)' },
    '.cm-callout-line-warning': { backgroundColor: 'rgba(233, 188, 97, 0.08)', borderColor: 'var(--accent-warning)' },
    '.cm-callout-line-danger': {
      backgroundColor: 'rgba(201, 119, 107, 0.08)',
      borderColor: 'var(--accent-link-broken)',
    },
    '.cm-callout-line-info': { backgroundColor: 'rgba(139, 130, 190, 0.08)', borderColor: 'var(--accent-info)' },
    // Real gap *outside* a callout's border (hideSyntaxPlugin.ts's
    // emitCallout decorates the ordinary, border-less line just before/after
    // one with these) — the callout's own top/bottom padding above is inside
    // the border and can only make the tinted box itself bigger, never open
    // space beyond it, and margin isn't safe here (see `.cm-line`'s own
    // comment on CodeMirror's line-height/arrow-key constraint). Declared
    // after every other line-type rule above (paragraph, heading, list, code
    // block) so this wins the cascade no matter what kind of line happens to
    // sit next to the callout.
    '.cm-callout-gap-before': { paddingBottom: 'var(--space-content-sm)' },
    '.cm-callout-gap-after': { paddingTop: 'var(--space-content-sm)' },
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
