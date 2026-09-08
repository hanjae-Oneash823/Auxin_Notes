import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

// Mirrors parseLinksAndTags.ts's TAG_PATTERN exactly — same duplication
// precedent as WIKILINK_PATTERN already has between the indexing layer and
// linkChipWidget.ts. A `#` immediately followed by whitespace is a markdown
// heading marker, not a tag, hence the required leading word char.
const TAG_PATTERN = /(?:^|\s)#([a-zA-Z0-9_][a-zA-Z0-9_/-]*)/g;

class TagChipWidget extends WidgetType {
  constructor(private readonly tag: string) {
    super();
  }

  eq(other: TagChipWidget) {
    return other.tag === this.tag;
  }

  toDOM() {
    const chip = document.createElement('span');
    chip.className = 'auxin-tag-chip';
    chip.textContent = `#${this.tag}`;
    chip.style.fontFamily = 'var(--font-family)';
    // Rounded corners + italic, deliberately different from link chips
    // (linkChipWidget.ts: "sharp corners, thin status-colored border") so
    // this doesn't read as another kind of link.
    chip.style.border = '1px solid var(--border-default)';
    chip.style.borderRadius = '4px';
    chip.style.fontStyle = 'italic';
    chip.style.color = 'var(--fg-muted)';
    chip.style.padding = '0 4px';
    return chip;
  }
}

/**
 * Renders inline `#tag` / `#nested/tag` text as a small colored chip — the
 * same "cursor on this line → raw text, else → widget" rule as every other
 * syntax-hiding plugin here, so the raw `#tag` stays reachable for editing.
 * Purely visual for now, no click behavior — matches whatever the tag
 * browser sidebar counts (parseInlineTags uses the identical pattern), it
 * doesn't add its own notion of what counts as a tag.
 */
export function createTagChipPlugin(readOnly: boolean) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, readOnly);
      }
      update(update: ViewUpdate) {
        // See hideSyntaxPlugin.ts — rebuilding mid-IME-composition crashes
        // CodeMirror's own composition handling, so just remap positions
        // and defer the real rebuild until composition ends.
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

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);

      for (const match of line.text.matchAll(TAG_PATTERN)) {
        const tag = match[1];
        const hashIndex = match[0].indexOf('#');
        const start = line.from + (match.index ?? 0) + hashIndex;
        const end = start + 1 + tag.length;
        const cursorOnTag = !readOnly && selection.from <= end && selection.to >= start;
        if (cursorOnTag) continue;

        builder.add(start, end, Decoration.replace({ widget: new TagChipWidget(tag) }));
      }
      pos = line.to + 1;
    }
  }

  return builder.finish();
}
