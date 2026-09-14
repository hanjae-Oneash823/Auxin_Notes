import katex from 'katex';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

// `$$...$$` may span multiple lines, so it's found once over the whole
// document text rather than line-by-line like the other widget plugins —
// there's no syntax-tree node for math to lean on instead (unlike
// links/images, @lezer/markdown has no built-in TeX extension). Matched
// first so inlineMathRanges below can skip anything a block match already
// claimed (`$$x$$` would otherwise also look like two back-to-back empty
// `$$` inline matches).
const BLOCK_MATH_PATTERN = /\$\$([\s\S]*?)\$\$/g;

// The no-leading/trailing-whitespace requirement on the content
// (`(?!\s)`/`(?<!\s)`) is what keeps ordinary prose like "$5 and $10" from
// being misread as math — the second `$` there is preceded by a space, so
// it can never close a match, and the whole line is left as plain text
// rather than guessing.
const INLINE_MATH_PATTERN = /\$(?!\s|\$)([^$\n]+?)(?<!\s)\$/g;

interface MathMatch {
  from: number;
  to: number;
  tex: string;
  display: boolean;
}

function findBlockMatches(text: string): MathMatch[] {
  const matches: MathMatch[] = [];
  for (const match of text.matchAll(BLOCK_MATH_PATTERN)) {
    const from = match.index ?? 0;
    matches.push({ from, to: from + match[0].length, tex: match[1].trim(), display: true });
  }
  return matches;
}

function findInlineMatches(text: string, blocks: MathMatch[]): MathMatch[] {
  const matches: MathMatch[] = [];
  for (const match of text.matchAll(INLINE_MATH_PATTERN)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (blocks.some((block) => from < block.to && to > block.from)) continue;
    matches.push({ from, to, tex: match[1].trim(), display: false });
  }
  return matches;
}

/** Skips a match sitting inside a code span/block (` `` ` or fenced) — raw
 *  TeX shown as a code example shouldn't render as an equation. */
function isInsideCode(view: EditorView, pos: number): boolean {
  let node = syntaxTree(view.state).resolveInner(pos, 1);
  for (; node.parent; node = node.parent) {
    if (node.name === 'InlineCode' || node.name === 'FencedCode' || node.name === 'CodeBlock') return true;
  }
  return false;
}

class MathWidget extends WidgetType {
  constructor(
    private readonly tex: string,
    private readonly display: boolean,
  ) {
    super();
  }

  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display;
  }

  toDOM() {
    const wrap = document.createElement(this.display ? 'div' : 'span');
    wrap.className = this.display ? 'cm-md-math-block' : 'cm-md-math-inline';
    try {
      katex.render(this.tex, wrap, { throwOnError: false, displayMode: this.display });
    } catch {
      wrap.textContent = this.tex;
      wrap.classList.add('cm-md-math-error');
    }
    return wrap;
  }

  ignoreEvent() {
    return true; // let clicks fall through to CodeMirror so they still place the cursor
  }
}

/**
 * Renders `$inline$` and `$$block$$` TeX as KaTeX, live-preview style: the
 * raw source shows only while the cursor/selection overlaps it (or always,
 * in read-only mode), same hide/reveal rule as hideSyntaxPlugin.ts's
 * bold/italic/code handling.
 */
export function createMathPlugin(readOnly: boolean) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, readOnly);
      }
      update(update: ViewUpdate) {
        // See hideSyntaxPlugin.ts — rebuilding mid-IME-composition crashes
        // CodeMirror's composition handling, so just remap positions and
        // defer the real rebuild until composition ends.
        if (update.view.composing) {
          if (update.docChanged) this.decorations = this.decorations.map(update.changes);
          return;
        }
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = build(update.view, readOnly);
        }
      }
    },
    { decorations: (instance) => instance.decorations },
  );
}

function build(view: EditorView, readOnly: boolean): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const selection = view.state.selection.main;
  const text = view.state.doc.toString();

  const blockMatches = findBlockMatches(text);
  const allMatches = [...blockMatches, ...findInlineMatches(text, blockMatches)].sort((a, b) => a.from - b.from);

  for (const match of allMatches) {
    if (match.tex.length === 0) continue;
    if (!match.display && isInsideCode(view, match.from)) continue;
    const cursorInMath = !readOnly && selection.from <= match.to && selection.to >= match.from;
    if (cursorInMath) continue;
    builder.add(
      match.from,
      match.to,
      Decoration.replace({
        widget: new MathWidget(match.tex, match.display),
        block: match.display,
      }),
    );
  }

  return builder.finish();
}
