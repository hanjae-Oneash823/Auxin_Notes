import { invoke } from '@tauri-apps/api/core';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;

const dataUrlCache = new Map<string, string>();

class ImageWidget extends WidgetType {
  constructor(
    private readonly absolutePath: string,
    private readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.absolutePath === this.absolutePath && other.alt === this.alt;
  }

  toDOM() {
    const img = document.createElement('img');
    img.alt = this.alt;
    img.style.maxWidth = '100%';
    img.style.display = 'block';
    img.style.margin = 'var(--space-content-sm) 0';

    const cached = dataUrlCache.get(this.absolutePath);
    if (cached) {
      img.src = cached;
    } else {
      invoke<string>('read_image_data_url', { path: this.absolutePath })
        .then((dataUrl) => {
          dataUrlCache.set(this.absolutePath, dataUrl);
          img.src = dataUrl;
        })
        .catch(() => {
          img.replaceWith(document.createTextNode(`[image not found: ${this.alt}]`));
        });
    }
    return img;
  }
}

/**
 * Inline full-size image rendering, same "cursor on this line → raw text,
 * else → widget" rule as the syntax-hiding plugin, so the editor's hide/
 * reveal behavior feels like one coherent mechanism rather than several.
 */
export function createImageWidgetPlugin(resolveImagePath: (url: string) => string, readOnly: boolean) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, resolveImagePath, readOnly);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = build(update.view, resolveImagePath, readOnly);
        }
      }
    },
    { decorations: (instance) => instance.decorations },
  );
}

function build(
  view: EditorView,
  resolveImagePath: (url: string) => string,
  readOnly: boolean,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const selection = view.state.selection.main;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const cursorOnLine = !readOnly && selection.from <= line.to && selection.to >= line.from;

      if (!cursorOnLine) {
        for (const match of line.text.matchAll(IMAGE_PATTERN)) {
          const start = line.from + (match.index ?? 0);
          const end = start + match[0].length;
          const [, alt, url] = match;
          builder.add(
            start,
            end,
            Decoration.replace({ widget: new ImageWidget(resolveImagePath(url), alt) }),
          );
        }
      }
      pos = line.to + 1;
    }
  }

  return builder.finish();
}
