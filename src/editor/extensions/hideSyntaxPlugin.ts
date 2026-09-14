import { syntaxTree } from '@codemirror/language';
import { type Line, RangeSetBuilder, type Text } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { headingFoldChanged, isHeadingFolded, toggleHeadingFold } from './headingFoldPlugin';
import { isListItemLine, isOrderedListItemLine } from './listEditing';
import { HEADING_LEVEL } from './markdownHeadingUtils';

const HIDDEN = Decoration.replace({});
const CODE_LINE = Decoration.line({ class: 'cm-md-codeblock-line' });

/** `> [!type] Title` — the Obsidian/GitHub callout convention, same family
 *  as the `|width` alt-text suffix and `[[wikilink]]` syntax this app
 *  already borrows from Obsidian. An unrecognized type is left as a plain,
 *  unstyled blockquote rather than guessing. */
const CALLOUT_TYPES = new Set(['note', 'tip', 'warning', 'danger', 'info']);
const CALLOUT_PATTERN = /^\[!([a-zA-Z]+)\]\s*(.*)$/;

/** Matches an ATX heading line's own raw text — used only to check whether
 *  the line *after* a heading is itself another heading (see emitHeading),
 *  so a subheading directly under its parent stays tight while a heading
 *  followed by ordinary text gets the normal line gap. */
const ATX_HEADING_RE = /^#{1,6}(\s|$)/;

/**
 * Typora-style live preview: markdown syntax marks (`#`, `**`, `*`, `` ` ``)
 * are hidden and their content styled, UNLESS the cursor/selection is
 * anywhere inside that construct's full range — then the raw text shows so
 * it stays editable. Rebuilt from the Lezer syntax tree on every doc or
 * selection change, walking only the visible ranges for performance.
 *
 * In reading mode (`readOnly`), cursor position is ignored entirely — syntax
 * always stays hidden, since there's nothing to edit.
 */
export function createHideSyntaxPlugin(readOnly: boolean) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, readOnly);
      }

      update(update: ViewUpdate) {
        // Rebuilding decorations out from under an active IME composition
        // (typing Korean/Japanese/Chinese) crashes CodeMirror's own
        // composition handling — remap positions instead and defer the
        // real rebuild until composition ends (its own docChanged fires).
        if (update.view.composing) {
          if (update.docChanged) this.decorations = this.decorations.map(update.changes);
          return;
        }
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          headingFoldChanged(update.startState, update.state)
        ) {
          this.decorations = buildDecorations(update.view, readOnly);
        }
      }
    },
    { decorations: (instance) => instance.decorations },
  );
}

interface DecoRange {
  from: number;
  to: number;
  deco: Decoration;
}

function buildDecorations(view: EditorView, readOnly: boolean): DecorationSet {
  const selection = view.state.selection.main;

  // Collected rather than added straight to a RangeSetBuilder: a construct
  // like `***bold italic***` parses as nested Emphasis(StrongEmphasis(...)),
  // and the tree walk visits the outer node (whose content span covers the
  // inner node's start) before the inner one — an out-of-order `from` that
  // RangeSetBuilder rejects. Sorting once at the end handles nesting of any
  // depth without the walk needing to know about it.
  const ranges: DecoRange[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const level = HEADING_LEVEL[node.name];
        if (level !== undefined) {
          emitHeading(ranges, node.node, view, level, selection.from, selection.to, readOnly);
          return;
        }
        if (node.name === 'StrongEmphasis') {
          emitDelimited(ranges, node.node, 'cm-md-strong', selection.from, selection.to, readOnly);
          return;
        }
        if (node.name === 'Emphasis') {
          emitDelimited(ranges, node.node, 'cm-md-emphasis', selection.from, selection.to, readOnly);
          return;
        }
        if (node.name === 'InlineCode') {
          emitDelimited(ranges, node.node, 'cm-md-inline-code', selection.from, selection.to, readOnly);
          return;
        }
        if (node.name === 'FencedCode') {
          emitCodeBlockLines(ranges, node.node, view.state.doc);
          emitDelimited(ranges, node.node, 'cm-md-codeblock', selection.from, selection.to, readOnly);
          return;
        }
        if (node.name === 'Blockquote') {
          emitCallout(ranges, node.node, view.state.doc, selection.from, selection.to, readOnly);
        }
        // No `return` — a list item's own inline text (emphasis, links,
        // nested headings) still needs the branches above to run on its
        // descendants, and a nested list's own items are reached by simply
        // letting the walk continue into this node's children.
        if (node.name === 'ListItem') {
          emitListItemLines(ranges, node.node, view.state.doc);
        }
        if (node.name === 'ListMark') {
          emitListMark(ranges, node.node, view.state.doc);
        }
      },
    });
  }

  // RangeSetBuilder requires strictly non-decreasing (from, value.startSide)
  // pairs — sort on exactly that, not `to`, since a mark and a replace
  // decoration starting at the same position don't share a startSide.
  ranges.sort((a, b) => a.from - b.from || a.deco.startSide - b.deco.startSide);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of ranges) builder.add(from, to, deco);
  return builder.finish();
}

function cursorIntersects(node: SyntaxNode, from: number, to: number): boolean {
  return from <= node.to && to >= node.from;
}

function emitHeading(
  out: DecoRange[],
  node: SyntaxNode,
  view: EditorView,
  level: number,
  selFrom: number,
  selTo: number,
  readOnly: boolean,
) {
  const mark = node.getChild('HeaderMark');
  if (!mark) return;

  const doc = view.state.doc;

  // Bands the line with a tighter line-height regardless of cursor
  // position — like the codeblock/callout line classes below, this is
  // layout (how far apart stacked headers sit), not a hide/reveal styling
  // choice, so it shouldn't flicker on and off as the cursor moves through.
  const line = doc.lineAt(node.from);
  // One combined class on one `Decoration.line()` call, not two separate
  // pushes at the same position — CM6 doesn't reliably merge the `class`
  // attribute across multiple same-position line decorations, which was
  // silently dropping `cm-md-heading-line-${level}`'s `marginLeft` (the
  // left offset every other heading gets) specifically on a note's first
  // heading, the one line that also needed the second `cm-md-heading-first`
  // class below.
  const lineClasses = [`cm-md-heading-line-${level}`];
  // The note's true first line skips the level-scaled space-before —
  // `.cm-content`'s own top padding already gives it room, so adding more
  // here would push it down further than any other note's first line (see
  // the matching `.cm-md-heading-first` rule in theme.ts).
  if (line.from === 0) lineClasses.push('cm-md-heading-first');
  // Only a subheading directly under its parent (no body text between
  // them) stays flush — a heading followed by ordinary text gets the same
  // gap every other line gets. Checked against raw text, not the syntax
  // tree, since all that matters here is "does the next line look like
  // another ATX heading." Folded into `lineClasses` rather than a second
  // `out.push` at this same `line.from` — a separate same-position
  // `Decoration.line()` call is exactly what caused the `heading-first`
  // bug above; a heading that is *both* the note's first line *and*
  // immediately followed by a subheading needs all three classes merged
  // into the one call.
  const nextLine = line.number < doc.lines ? doc.line(line.number + 1) : null;
  if (nextLine && ATX_HEADING_RE.test(nextLine.text)) lineClasses.push('cm-md-heading-tight-below');
  out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: lineClasses.join(' ') }) });

  // A bare caret sitting exactly at the heading's own start boundary
  // doesn't count as "engaging" with it — otherwise CodeMirror's default
  // doc-position-0 initial cursor, which for a note opening with a heading
  // lands exactly at that heading's start, would force it to show raw,
  // unstyled markdown until the user clicks elsewhere, even though they
  // never actually interacted with it. Real edits (selecting into the
  // heading, or a caret anywhere past its first character) are unaffected.
  const cursorAtOwnStart = selFrom === selTo && selFrom === node.from;
  if (!readOnly && !cursorAtOwnStart && cursorIntersects(node, selFrom, selTo)) {
    out.push({ from: mark.from, to: mark.to, deco: Decoration.mark({ class: 'cm-md-mark' }) });
    return;
  }

  // Replace the `#` marks and the single space after them with a small
  // level-scaled, clickable chevron — same "reveal raw markdown only while
  // the cursor is in it" dual-mode as the callout `[!type]` marker above,
  // just standing in for the mark itself rather than the whole thing.
  const contentStart = Math.min(mark.to + 1, node.to);
  const folded = isHeadingFolded(view.state, node.from);
  out.push({
    from: mark.from,
    to: contentStart,
    deco: Decoration.replace({ widget: new HeadingIconWidget(view, level, node.from, folded) }),
  });
  if (contentStart < node.to) {
    out.push({ from: contentStart, to: node.to, deco: Decoration.mark({ class: `cm-md-heading-${level}` }) });
  }
}

function emitDelimited(
  out: DecoRange[],
  node: SyntaxNode,
  contentClass: string,
  selFrom: number,
  selTo: number,
  readOnly: boolean,
) {
  const marks = node.getChildren('EmphasisMark');
  const codeMarks = node.getChildren('CodeMark');
  const [openMark, closeMark] = marks.length === 2 ? marks : codeMarks;
  if (!openMark || !closeMark) return;

  if (!readOnly && cursorIntersects(node, selFrom, selTo)) {
    out.push({ from: openMark.from, to: openMark.to, deco: Decoration.mark({ class: 'cm-md-mark' }) });
    out.push({ from: closeMark.from, to: closeMark.to, deco: Decoration.mark({ class: 'cm-md-mark' }) });
    return;
  }

  out.push({ from: openMark.from, to: openMark.to, deco: HIDDEN });
  if (openMark.to < closeMark.from) {
    out.push({ from: openMark.to, to: closeMark.from, deco: Decoration.mark({ class: contentClass }) });
  }
  out.push({ from: closeMark.from, to: closeMark.to, deco: HIDDEN });
}

/** Bands every line the fenced block spans (fence lines included) with a
 *  background, independent of cursor position — unlike the mark-hiding
 *  above, the block should still look like a code card while it's being
 *  edited, not just when the cursor is elsewhere. */
function emitCodeBlockLines(out: DecoRange[], node: SyntaxNode, doc: Text) {
  for (let pos = node.from; pos <= node.to; ) {
    const line = doc.lineAt(pos);
    out.push({ from: line.from, to: line.from, deco: CODE_LINE });
    pos = line.to + 1;
  }
}

/** Bands every line a list item spans (its own wrapped lines, plus any
 *  nested list under it, since a `ListItem` node's span already covers its
 *  descendants) with a tighter line gap — independent of cursor position,
 *  same as the code-block banding above, since this is rhythm between rows
 *  of a list, not a hide/reveal styling choice.
 *
 *  The one exception is the line right before non-list content resumes —
 *  detected by raw next-line text rather than the syntax tree (same
 *  pragmatic heuristic emitHeading's `ATX_HEADING_RE` check uses for an
 *  identical "does the next line still belong to this construct" question)
 *  — which gets `cm-md-list-line-last` instead, falling back to the
 *  ordinary paragraph gap so leaving a list reads as a real block break. A
 *  list that runs to the very end of the document is left alone: there's
 *  nothing after it for the bigger gap to separate it from.
 *
 *  A second exception, for a line that's IN the ListItem's span but doesn't
 *  itself look like list content (no marker of its own, and no leading
 *  indentation): typing a plain paragraph directly under a list item with
 *  no blank line between them gets folded into that item's span as a lazy
 *  continuation, even though it's flush-left and clearly meant to be a
 *  separate paragraph, not more of the bullet's own text. Left un-decorated,
 *  such a line falls through to CodeMirror's own default `.cm-line`
 *  styling — plain paragraph rhythm, no hanging indent — instead of
 *  inheriting `cm-md-list-line`'s `padding-left`/`text-indent` meant for
 *  genuine bullet rows, which would otherwise indent its wrapped rows (but
 *  not its first, since text-indent only ever affects a line's first row)
 *  for no reason visible in the source. */
function emitListItemLines(out: DecoRange[], node: SyntaxNode, doc: Text) {
  // Read once per item, off the line the marker itself is on (node.from) —
  // an ordered item's numeral column needs a wider hanging-indent than a
  // bullet's small fixed-size dot (see cm-md-list-line-ordered in
  // theme.ts), and every line of the item (wrapped rows included) needs
  // that same footprint, not just the one with the marker on it.
  const isOrdered = isOrderedListItemLine(doc.lineAt(node.from).text);
  for (let pos = node.from; pos <= node.to; ) {
    const line = doc.lineAt(pos);
    const hasLeadingIndent = /^[ \t]/.test(line.text);
    if (!hasLeadingIndent && !isListItemLine(line.text)) {
      pos = line.to + 1;
      continue;
    }
    const nextLine = line.number < doc.lines ? doc.line(line.number + 1) : null;
    const isLastBeforeNonList = nextLine !== null && !isListItemLine(nextLine.text);
    const classes = ['cm-md-list-line'];
    if (isOrdered) classes.push('cm-md-list-line-ordered');
    if (isLastBeforeNonList) classes.push('cm-md-list-line-last');
    out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: classes.join(' ') }) });
    pos = line.to + 1;
  }
}

// Cycles disc → hollow ring → square → diamond every 4 levels (one shape
// short of MAX_LIST_DEPTH_CLASS's 5 possible depths, so only the rare
// 5th-level-deep case repeats a shape, not the much more common 4th) — the
// same convention Notion/most outliners use so a deeply nested list still
// reads as nested at a glance instead of every level looking identical.
// Paired with a depth-scoped size class (cm-md-list-bullet-depth-N in
// theme.ts) so depth is legible from size too, not shape alone.
//
// Drawn as fixed-geometry SVG rather than a `•`/`◦`/`▪` font glyph — a text
// character's size and baseline position are set by whatever font happens
// to be active, which is exactly what made the old bullets look inconsistent
// (never quite centered on the text's x-height, and a different visual
// weight per font). Same fixed-viewBox pattern as HEADING_ICON_SVG and
// CALLOUT_ICON_SVG below — one shape, precisely sized and positioned via
// CSS instead of trusting font metrics.
const BULLET_ICON_SVGS = [
  '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.7" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  '<svg viewBox="0 0 16 16"><rect x="5" y="5" width="6" height="6" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 16 16"><rect x="5.2" y="5.2" width="5.6" height="5.6" transform="rotate(45 8 8)" fill="currentColor"/></svg>',
];
const LIST_INDENT_UNIT_CHARS = 4; // matches listEditing.ts's LIST_INDENT_UNIT
const MAX_LIST_DEPTH_CLASS = 4;

class ListBulletWidget extends WidgetType {
  constructor(private readonly depth: number) {
    super();
  }

  eq(other: ListBulletWidget) {
    return other.depth === this.depth;
  }

  toDOM() {
    const bullet = document.createElement('span');
    bullet.className = `cm-md-list-bullet cm-md-list-bullet-depth-${this.depth}`;
    bullet.innerHTML = BULLET_ICON_SVGS[this.depth % BULLET_ICON_SVGS.length];
    return bullet;
  }
}

/** A `-`/`*`/`+` marker becomes a small depth-cycling bullet glyph; a `1.`/
 *  `1)` marker keeps its actual digits (so the count stays meaningful and
 *  still edits like normal text) but gets dimmed the same way. Depth reads
 *  off the marker's own raw leading whitespace (4 spaces/level, same unit
 *  `listEditing.ts` indents by) rather than the syntax tree's list-nesting
 *  depth — cheaper, and the two agree by construction since that's the only
 *  way to nest a list item in this app.
 *
 *  That raw leading whitespace is then hidden outright (unconditionally,
 *  not cursor-gated — same precedent as the bullet-widget replacement right
 *  below, which never reveals the raw `-`/`*`/`+` character either) so the
 *  visual indent comes entirely from `--space-list-indent` via
 *  `cm-md-list-depth-N` in theme.ts, not from however many raw spaces
 *  happen to be in the source rendered at a proportional font's variable
 *  width on top of it. `listEditing.ts`'s Tab/Shift-Tab still read and
 *  write those literal spaces — only how they're *drawn* changes here. */
function emitListMark(out: DecoRange[], node: SyntaxNode, doc: Text) {
  const line = doc.lineAt(node.from);
  const indent = doc.sliceString(line.from, node.from);
  const depth = Math.min(Math.floor(indent.length / LIST_INDENT_UNIT_CHARS), MAX_LIST_DEPTH_CLASS);
  // Pushed even at depth 0 now — every list line gets a base indent (see
  // --space-list-indent-base in tokens.css), not just nested ones.
  out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: `cm-md-list-depth-${depth}` }) });
  if (node.from > line.from) {
    out.push({ from: line.from, to: node.from, deco: HIDDEN });
  }

  const markText = doc.sliceString(node.from, node.to);
  if (/^[-*+]$/.test(markText)) {
    out.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new ListBulletWidget(depth) }) });
  } else {
    out.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-md-list-number' }) });
  }

  // The raw space(s) between the marker and the item's content are hidden
  // too — left alone, that whitespace is the only thing producing the
  // marker-to-text gap, which makes it as thin and inconsistent as any
  // other font-glyph-driven spacing (and looks especially cramped now that
  // the bullet is drawn bigger/higher-contrast — see cm-md-list-bullet in
  // theme.ts). `marginRight` there gives a real, controlled gap instead.
  const afterMark = doc.sliceString(node.to, line.to);
  const spaceMatch = /^ +/.exec(afterMark);
  if (spaceMatch) {
    out.push({ from: node.to, to: node.to + spaceMatch[0].length, deco: HIDDEN });
  }
}

// A single muted glyph shared by every heading level (sizing scales by
// level via the `cm-md-heading-icon-N` class in theme.ts instead) — drawn
// pointing right at rest (collapsed) and rotated 90° via
// `.cm-md-heading-icon-expanded` in theme.ts when its section is open,
// rather than swapping to a second "down" glyph.
const HEADING_ICON_SVG =
  '<svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Stands in for a heading's own `#` marks while the cursor is elsewhere —
 *  same dual-mode precedent as `CalloutIconWidget` below, plus doubling as
 *  the fold/unfold control for the section under this heading (click
 *  dispatches `toggleHeadingFold`, same click-handling shape as
 *  `LinkChipWidget`/`ImageWidget` elsewhere in this file's sibling
 *  modules). */
class HeadingIconWidget extends WidgetType {
  constructor(
    private readonly view: EditorView,
    private readonly level: number,
    private readonly headingPos: number,
    private readonly folded: boolean,
  ) {
    super();
  }

  eq(other: HeadingIconWidget) {
    return other.level === this.level && other.headingPos === this.headingPos && other.folded === this.folded;
  }

  toDOM() {
    const icon = document.createElement('span');
    icon.className = `cm-md-heading-icon cm-md-heading-icon-${this.level}${this.folded ? '' : ' cm-md-heading-icon-expanded'}`;
    icon.innerHTML = HEADING_ICON_SVG;
    icon.title = this.folded ? 'Expand section' : 'Collapse section';

    // Same mousedown/click split as the image widget's edit button: without
    // the mousedown preventDefault, CM6 first moves the cursor to wherever
    // was clicked (inside the now-hidden mark range) before the click
    // handler even runs.
    icon.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    icon.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.view.dispatch({ effects: toggleHeadingFold.of(this.headingPos) });
    });

    return icon;
  }
}

// Minimal hand-drawn glyphs (16x16, `currentColor` strokes) rather than
// pulling in an icon library — every other CodeMirror widget in this app
// (resize handle, caption button) is plain DOM for the same reason, and
// these are hardcoded constants, never interpolated with user input, so
// `innerHTML` here carries no injection risk.
const CALLOUT_ICON_SVG: Record<string, string> = {
  note: '<svg viewBox="0 0 16 16"><path d="M3 2h7l3 3v9H3z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 2v3h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  tip: '<svg viewBox="0 0 16 16"><path d="M8 1.5a4 4 0 0 0-2.2 7.3c.4.3.7.8.7 1.3v.4h3v-.4c0-.5.3-1 .7-1.3A4 4 0 0 0 8 1.5z" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="6.3" y1="12.5" x2="9.7" y2="12.5" stroke="currentColor" stroke-width="1.3"/><line x1="6.7" y1="14" x2="9.3" y2="14" stroke="currentColor" stroke-width="1.3"/></svg>',
  warning: '<svg viewBox="0 0 16 16"><path d="M8 1.5 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="8" y1="6" x2="8" y2="9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11.7" r="0.9" fill="currentColor"/></svg>',
  danger: '<svg viewBox="0 0 16 16"><path d="M5 1.5h6L15 5v6l-4 3.5H5L1 11V5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="8" y1="5" x2="8" y2="8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="10.7" r="0.9" fill="currentColor"/></svg>',
  info: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="8" y1="7" x2="8" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="4.8" r="0.9" fill="currentColor"/></svg>',
};

/** Replaces a hidden `[!type]` marker with its type icon — always shown, so
 *  the callout's kind stays scannable at a glance even with a custom title
 *  — plus the capitalized type name as a fallback label when there's no
 *  custom title to show instead. */
class CalloutIconWidget extends WidgetType {
  constructor(
    private readonly type: string,
    private readonly showLabel: boolean,
  ) {
    super();
  }

  eq(other: CalloutIconWidget) {
    return other.type === this.type && other.showLabel === this.showLabel;
  }

  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = `cm-callout-icon-title cm-callout-text-${this.type}`;

    const icon = document.createElement('span');
    icon.className = 'cm-callout-icon';
    icon.innerHTML = CALLOUT_ICON_SVG[this.type];
    wrap.appendChild(icon);

    if (this.showLabel) {
      const label = document.createElement('span');
      label.textContent = this.type.charAt(0).toUpperCase() + this.type.slice(1);
      label.className = 'cm-callout-label';
      wrap.appendChild(label);
    }

    return wrap;
  }
}

/** Position right after a line's leading `>` (plus one following space, if
 *  there is one) — computed from raw text rather than the syntax tree, since
 *  a continuation line's `>` parses as a descendant of the blockquote's
 *  inner paragraph, not a direct child of the Blockquote node, so
 *  `node.getChildren('QuoteMark')` only ever finds the first line's. */
function stripQuoteMark(lineFrom: number, lineTo: number, doc: Text): number {
  const afterAngle = Math.min(lineFrom + 1, lineTo);
  return doc.sliceString(afterAngle, afterAngle + 1) === ' ' ? afterAngle + 1 : afterAngle;
}

interface CalloutSegment {
  type: string;
  title: string;
  markerFrom: number;
  markerEnd: number;
  lines: Line[];
}

/** Splits a Blockquote node's quoted lines into one segment per `[!type]`
 *  marker found in it. Normally a node holds exactly one callout, but
 *  CommonMark lazy continuation merges two `> [!type]...` blocks typed with
 *  no blank line between them into a *single* Blockquote node — without
 *  this split, the second marker would just render as the first callout's
 *  plain quoted body text instead of its own box (Auxin's own
 *  Formatting Guide.md documents repeating `>` on every line, same as the
 *  list-swallowing case above, so there's no intended usage this could
 *  break). A quoted line before any recognized marker (plain, non-callout
 *  blockquote content) is simply left out of every segment, matching how a
 *  plain blockquote already renders unstyled elsewhere in this app. */
function splitCalloutSegments(node: SyntaxNode, doc: Text): CalloutSegment[] {
  const segments: CalloutSegment[] = [];
  for (let pos = node.from; pos <= node.to; ) {
    const line = doc.lineAt(pos);
    if (doc.sliceString(line.from, line.from + 1) === '>') {
      const afterMark = stripQuoteMark(line.from, line.to, doc);
      const match = CALLOUT_PATTERN.exec(doc.sliceString(afterMark, line.to));
      const type = match?.[1].toLowerCase();
      if (type && CALLOUT_TYPES.has(type)) {
        const markerEnd = afterMark + match![0].length - match![2].length;
        segments.push({ type, title: match![2].trim(), markerFrom: afterMark, markerEnd, lines: [line] });
      } else if (segments.length > 0) {
        segments[segments.length - 1].lines.push(line);
      }
    }
    pos = line.to + 1;
  }
  return segments;
}

function emitCallout(
  out: DecoRange[],
  node: SyntaxNode,
  doc: Text,
  selFrom: number,
  selTo: number,
  readOnly: boolean,
) {
  const firstLine = doc.lineAt(node.from);
  if (doc.sliceString(firstLine.from, firstLine.from + 1) !== '>') return;

  for (const segment of splitCalloutSegments(node, doc)) {
    emitCalloutSegment(out, segment, doc, selFrom, selTo, readOnly);
  }
}

function emitCalloutSegment(
  out: DecoRange[],
  segment: CalloutSegment,
  doc: Text,
  selFrom: number,
  selTo: number,
  readOnly: boolean,
) {
  const { type, title, markerFrom, markerEnd, lines } = segment;

  // Band every quoted line the segment spans, regardless of cursor
  // position — like fenced code blocks, the box shouldn't vanish while it's
  // being edited. The first/last line each get an extra class so the border
  // wraps the segment once (top edge, bottom edge) instead of striping
  // every wrapped line with its own top-and-bottom border.
  lines.forEach((line, index) => {
    const classes = ['cm-callout-line', `cm-callout-line-${type}`];
    if (index === 0) classes.push('cm-callout-line-top');
    if (index === lines.length - 1) classes.push('cm-callout-line-bottom');
    out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: classes.join(' ') }) });
  });

  // The callout's border sits at the outer edge of its own padding — there's
  // no room *outside* it to open up via the callout's own line classes (see
  // theme.ts). The only place padding reads as real outside whitespace is on
  // the ordinary, border-less line next to it, so that's decorated here
  // instead — skipped when the segment opens/closes the document, when (for
  // gap-before specifically) the line above is itself another segment's own
  // last line (two directly-adjacent merged callouts have no ordinary line
  // between them to decorate), and — for either side — when the adjacent
  // line is itself a heading or list item.
  //
  // That last exclusion matters: a heading or list line gets its OWN
  // `Decoration.line()` push elsewhere (emitHeading / emitListItemLines)
  // with its own before/after spacing baked in. Two separate `.line()`
  // calls landing on the same position is the same "class silently dropped"
  // CM6 quirk documented on `.cm-md-heading-icon` above — in practice
  // whichever push wins, the OTHER one's spacing vanishes, which is exactly
  // what produced the "no gap between a callout and the header after it"
  // bug this comment is here to prevent from coming back. Skipping the
  // callout's own gap decoration in that case leaves the heading/list
  // line's own (already-correct, level-scaled) spacing as the only
  // decoration at that position — nothing left to collide with.
  const firstCalloutLine = lines[0];
  if (firstCalloutLine.from > 0) {
    const before = doc.lineAt(firstCalloutLine.from - 1);
    const beforeIsClaimed =
      doc.sliceString(before.from, before.from + 1) === '>' ||
      ATX_HEADING_RE.test(before.text) ||
      isListItemLine(before.text);
    if (!beforeIsClaimed) {
      out.push({ from: before.from, to: before.from, deco: Decoration.line({ class: 'cm-callout-gap-before' }) });
    }
  }
  const lastCalloutLine = lines[lines.length - 1];
  if (lastCalloutLine.to < doc.length) {
    const after = doc.lineAt(lastCalloutLine.to + 1);
    const afterIsClaimed = ATX_HEADING_RE.test(after.text) || isListItemLine(after.text);
    if (!afterIsClaimed) {
      out.push({ from: after.from, to: after.from, deco: Decoration.line({ class: 'cm-callout-gap-after' }) });
    }
  }

  // Scoped to this segment's own line range, not the whole (possibly
  // multi-callout) Blockquote node — editing one merged-in callout
  // shouldn't force a neighboring one to reveal its raw markdown too.
  const segFrom = lines[0].from;
  const segTo = lines[lines.length - 1].to;
  if (!readOnly && selFrom <= segTo && selTo >= segFrom) return;

  // Hide the leading `>` on every line in the segment — a lazy-continuation
  // line (valid CommonMark: a blockquote paragraph may continue without a
  // repeated `>`) just has nothing to hide, so it's left untouched.
  for (const line of lines) {
    out.push({ from: line.from, to: stripQuoteMark(line.from, line.to, doc), deco: HIDDEN });
  }

  // The icon always replaces `[!type]` itself; the fallback type-name label
  // only fills in when there's no custom title, so the two never show at
  // once.
  out.push({ from: markerFrom, to: markerEnd, deco: Decoration.replace({ widget: new CalloutIconWidget(type, !title) }) });
  if (title) {
    out.push({
      from: markerEnd,
      to: lines[0].to,
      deco: Decoration.mark({ class: `cm-callout-title cm-callout-text-${type}` }),
    });
  }
}
