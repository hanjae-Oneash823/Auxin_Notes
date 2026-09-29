import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { anchorPattern } from '../../pdf/pdfAnchors';

const ANCHOR_MARK = Decoration.mark({ class: 'cm-pdf-anchor' });

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const match of text.matchAll(anchorPattern())) {
      const start = from + (match.index ?? 0);
      builder.add(start, start + match[0].length, ANCHOR_MARK);
    }
  }
  return builder.finish();
}

const anchorViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      // See hideSyntaxPlugin.ts — rebuilding mid-IME-composition crashes
      // CodeMirror, so just remap positions until composition ends.
      if (update.view.composing) {
        if (update.docChanged) this.decorations = this.decorations.map(update.changes);
        return;
      }
      if (update.docChanged || update.viewportChanged) this.decorations = build(update.view);
    }
  },
  { decorations: (instance) => instance.decorations },
);

/** Styles PDF anchors (`@p12`, see pdf/pdfAnchors.ts) in place — the text
 *  stays as typed, it is just tinted so anchors are easy to spot. */
export function createAnchorPlugin(): Extension {
  return anchorViewPlugin;
}
