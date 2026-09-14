import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { SyntaxNode } from '@lezer/common';

const HIDDEN = Decoration.replace({});

function cursorIntersects(node: SyntaxNode, from: number, to: number): boolean {
  return from <= node.to && to >= node.from;
}

/** `Link`'s children are always `[LinkMark("["), ...label, LinkMark("]"),
 *  LinkMark("("), URL, LinkMark(")")]` (see @lezer/markdown's `finishLink`)
 *  — a reference-style link (`[text][ref]`) parses as a `Link` too but
 *  without a `URL` child, so that case is left alone rather than guessed at. */
function findLinkUrlNode(view: EditorView, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1);
  for (; node; node = node.parent) {
    if (node.name === 'Link' && node.getChild('URL')) return node.getChild('URL');
  }
  return null;
}

function build(view: EditorView, readOnly: boolean): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const selection = view.state.selection.main;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'Link') return;
        const marks = node.node.getChildren('LinkMark');
        const url = node.node.getChild('URL');
        if (marks.length !== 4 || !url) return; // reference-style/malformed — leave raw text alone
        const [openBracket, closeBracket, , closeParen] = marks;

        if (!readOnly && cursorIntersects(node.node, selection.from, selection.to)) {
          for (const mark of marks) {
            builder.add(mark.from, mark.to, Decoration.mark({ class: 'cm-md-mark' }));
          }
          return;
        }

        builder.add(openBracket.from, openBracket.to, HIDDEN);
        if (openBracket.to < closeBracket.from) {
          builder.add(openBracket.to, closeBracket.from, Decoration.mark({ class: 'cm-md-link' }));
        }
        // One hidden range for `](url)` (or `](url "title")`) rather than
        // hiding each mark/the URL/an optional LinkTitle separately — they're
        // always contiguous, and this way stray internal whitespace (CommonMark
        // allows `[text]( url )`) can't leave a visible gap behind.
        builder.add(closeBracket.from, closeParen.to, HIDDEN);
      },
    });
  }

  return builder.finish();
}

const markdownLinkViewPlugin = (readOnly: boolean) =>
  ViewPlugin.fromClass(
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

/**
 * Renders `[text](url)` Typora-style: the `[`, `](`, and `)` (plus the URL
 * itself) are hidden while the cursor is elsewhere, leaving just the label
 * styled as a link — same hide/reveal rule as hideSyntaxPlugin.ts, but kept
 * in its own plugin (like bareUrlPlugin.ts/linkChipWidget.ts) since it also
 * owns click-to-open handling.
 *
 * Opening one is gated behind Cmd/Ctrl+click while the doc is editable, so a
 * plain click still just places the cursor for editing; in read-only mode a
 * plain click opens it directly — matching bareUrlPlugin.ts's convention.
 */
export function createMarkdownLinkPlugin(readOnly: boolean): Extension {
  return [
    markdownLinkViewPlugin(readOnly),
    EditorView.domEventHandlers({
      click(event, view) {
        if (!readOnly && !(event.metaKey || event.ctrlKey)) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        const urlNode = findLinkUrlNode(view, pos);
        if (!urlNode) return false;
        event.preventDefault();
        void openUrl(view.state.doc.sliceString(urlNode.from, urlNode.to));
        return true;
      },
    }),
  ];
}
