import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

const HIDDEN = Decoration.replace({});

const HEADING_LEVEL: Record<string, number> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
};

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
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, readOnly);
        }
      }
    },
    { decorations: (instance) => instance.decorations },
  );
}

function buildDecorations(view: EditorView, readOnly: boolean): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const selection = view.state.selection.main;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const level = HEADING_LEVEL[node.name];
        if (level !== undefined) {
          emitHeading(builder, node.node, level, selection.from, selection.to, readOnly);
          return;
        }
        if (node.name === 'StrongEmphasis') {
          emitDelimited(builder, node.node, 'cm-md-strong', selection.from, selection.to, readOnly);
          return;
        }
        if (node.name === 'Emphasis') {
          emitDelimited(builder, node.node, 'cm-md-emphasis', selection.from, selection.to, readOnly);
          return;
        }
        if (node.name === 'InlineCode') {
          emitDelimited(builder, node.node, 'cm-md-inline-code', selection.from, selection.to, readOnly);
        }
      },
    });
  }

  return builder.finish();
}

function cursorIntersects(node: SyntaxNode, from: number, to: number): boolean {
  return from <= node.to && to >= node.from;
}

function emitHeading(
  builder: RangeSetBuilder<Decoration>,
  node: SyntaxNode,
  level: number,
  selFrom: number,
  selTo: number,
  readOnly: boolean,
) {
  const mark = node.getChild('HeaderMark');
  if (!mark) return;

  if (!readOnly && cursorIntersects(node, selFrom, selTo)) {
    builder.add(mark.from, mark.to, Decoration.mark({ class: 'cm-md-mark' }));
    return;
  }

  // Hide the `#` marks and the single space after them, style the rest.
  const contentStart = Math.min(mark.to + 1, node.to);
  builder.add(mark.from, contentStart, HIDDEN);
  if (contentStart < node.to) {
    builder.add(contentStart, node.to, Decoration.mark({ class: `cm-md-heading-${level}` }));
  }
}

function emitDelimited(
  builder: RangeSetBuilder<Decoration>,
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
    builder.add(openMark.from, openMark.to, Decoration.mark({ class: 'cm-md-mark' }));
    builder.add(closeMark.from, closeMark.to, Decoration.mark({ class: 'cm-md-mark' }));
    return;
  }

  builder.add(openMark.from, openMark.to, HIDDEN);
  if (openMark.to < closeMark.from) {
    builder.add(openMark.to, closeMark.from, Decoration.mark({ class: contentClass }));
  }
  builder.add(closeMark.from, closeMark.to, HIDDEN);
}
