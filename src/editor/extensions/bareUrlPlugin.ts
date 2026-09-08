import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { SyntaxNode } from '@lezer/common';

// A bare URL/email is a leaf `URL` node whose parent isn't `Link`/`Image` (the
// `(url)` part of `[text](url)`/`![alt](url)`) or `Autolink` (the
// `<https://...>` angle-bracket form) — those already have, or will get,
// their own styling treatment. Everything else reaching this point was
// recognized by @lezer/markdown's `Autolink` extension (see markdownSetup.ts),
// which does the actual `www.`/`http(s)://`/email/mailto/xmpp detection,
// trailing-punctuation trimming, and code/existing-link exclusion — no need
// to duplicate any of that by hand.
const EXCLUDED_PARENTS = new Set(['Link', 'Image', 'Autolink']);

function isBareUrlNode(node: SyntaxNode): boolean {
  return node.name === 'URL' && !EXCLUDED_PARENTS.has(node.parent?.name ?? '');
}

/** The `Autolink` extension emits `www.` and bare-email matches without a
 *  protocol/scheme — `openUrl` needs one to know this isn't a local path. */
function toOpenableUrl(text: string): string {
  if (/^[a-z][\w+.-]*:/i.test(text)) return text; // already has a scheme (http:, mailto:, xmpp:, ...)
  if (text.includes('@')) return `mailto:${text}`;
  return `https://${text}`;
}

function findBareUrlNodeAt(view: EditorView, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1);
  for (; node; node = node.parent) {
    if (isBareUrlNode(node)) return node;
  }
  return null;
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (isBareUrlNode(node.node)) builder.add(node.from, node.to, Decoration.mark({ class: 'cm-bare-url' }));
      },
    });
  }
  return builder.finish();
}

const bareUrlViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      // See hideSyntaxPlugin.ts — rebuilding mid-IME-composition crashes
      // CodeMirror's own composition handling, so just remap positions and
      // defer the real rebuild until composition ends.
      if (update.view.composing) {
        if (update.docChanged) this.decorations = this.decorations.map(update.changes);
        return;
      }
      if (update.docChanged || update.viewportChanged) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (instance) => instance.decorations },
);

/**
 * Styles bare URLs and email addresses (`www.`/`http(s)://`/plain
 * `name@domain`, per @lezer/markdown's `Autolink` extension — enabled in
 * markdownSetup.ts) as colored, underlined text. Unlike the wikilink/tag
 * chips, this leaves the actual characters in place rather than replacing
 * them with a widget, since a URL is meant to stay readable/copyable as
 * text, not compacted.
 *
 * Opening one is gated behind Cmd/Ctrl+click while the doc is editable, so a
 * plain click still just places the cursor for editing; in read-only mode
 * (nothing to edit) a plain click opens it directly, matching the wikilink
 * chip's click-to-navigate behavior there.
 */
export function createBareUrlPlugin(readOnly: boolean): Extension {
  return [
    bareUrlViewPlugin,
    EditorView.domEventHandlers({
      click(event, view) {
        if (!readOnly && !(event.metaKey || event.ctrlKey)) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        const node = findBareUrlNodeAt(view, pos);
        if (!node) return false;
        event.preventDefault();
        void openUrl(toOpenableUrl(view.state.doc.sliceString(node.from, node.to)));
        return true;
      },
    }),
  ];
}
