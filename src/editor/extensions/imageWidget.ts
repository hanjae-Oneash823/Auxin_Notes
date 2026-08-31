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
const MIN_WIDTH_PX = 40;

const dataUrlCache = new Map<string, string>();

/** `![alt](url)` carries an optional `|width` size suffix in the alt text —
 *  e.g. `![a photo|300](url)` — the same convention Obsidian uses, so a
 *  resize just rewrites this suffix rather than needing separate storage. */
function parseAlt(raw: string): { alt: string; width: number | null } {
  const match = raw.match(/^(.*)\|(\d+)$/);
  if (!match) return { alt: raw, width: null };
  return { alt: match[1], width: Number(match[2]) };
}

function formatAlt(alt: string, width: number): string {
  return `${alt}|${width}`;
}

class ImageWidget extends WidgetType {
  constructor(
    private readonly absolutePath: string,
    private readonly url: string,
    private readonly alt: string,
    private readonly width: number | null,
    private readonly from: number,
    private readonly to: number,
    private readonly readOnly: boolean,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return (
      other.absolutePath === this.absolutePath &&
      other.alt === this.alt &&
      other.width === this.width &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  toDOM(view: EditorView) {
    // Centering + resize handle share one mechanism: `outer` spans the full
    // text column and centers via `text-align`, `box` is an inline-block
    // that hugs the image's actual (possibly custom) width so the handle,
    // anchored to box's corner, always sits right at the image's edge.
    const outer = document.createElement('div');
    outer.style.textAlign = 'center';
    outer.style.margin = 'var(--space-content-sm) 0';

    const box = document.createElement('div');
    box.style.position = 'relative';
    box.style.display = 'inline-block';
    box.style.maxWidth = '100%';

    const img = document.createElement('img');
    img.alt = this.alt;
    img.draggable = false;
    img.style.display = 'block';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.width = this.width ? `${this.width}px` : 'auto';

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

    box.appendChild(img);
    if (!this.readOnly) {
      box.appendChild(this.createResizeHandle(view, img));
    }
    outer.appendChild(box);
    return outer;
  }

  private createResizeHandle(view: EditorView, img: HTMLImageElement): HTMLDivElement {
    const handle = document.createElement('div');
    handle.style.position = 'absolute';
    handle.style.right = '-2px';
    handle.style.bottom = '-2px';
    handle.style.width = '10px';
    handle.style.height = '10px';
    handle.style.boxSizing = 'border-box';
    handle.style.borderRadius = '2px';
    handle.style.background = '#fff';
    handle.style.border = '1px solid #000';
    handle.style.cursor = 'nwse-resize';
    handle.style.opacity = '0';
    handle.style.transition = 'opacity 0.1s ease';

    img.addEventListener('mouseenter', () => (handle.style.opacity = '1'));
    img.addEventListener('mouseleave', () => (handle.style.opacity = '0'));
    handle.addEventListener('mouseenter', () => (handle.style.opacity = '1'));

    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = img.getBoundingClientRect().width;
      handle.setPointerCapture(event.pointerId);
      handle.style.opacity = '1';

      const onMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.max(MIN_WIDTH_PX, Math.round(startWidth + (moveEvent.clientX - startX)));
        img.style.width = `${nextWidth}px`;
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        const finalWidth = Math.max(MIN_WIDTH_PX, Math.round(img.getBoundingClientRect().width));
        const insert = `![${formatAlt(this.alt, finalWidth)}](${this.url})`;
        view.dispatch({ changes: { from: this.from, to: this.to, insert } });
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });

    return handle;
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
        // See hideSyntaxPlugin.ts — rebuilding mid-IME-composition crashes
        // CodeMirror's composition handling, so just remap positions and
        // defer the real rebuild until composition ends.
        if (update.view.composing) {
          if (update.docChanged) this.decorations = this.decorations.map(update.changes);
          return;
        }
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
          const [, rawAlt, url] = match;
          const { alt, width } = parseAlt(rawAlt);
          builder.add(
            start,
            end,
            Decoration.replace({
              widget: new ImageWidget(resolveImagePath(url), url, alt, width, start, end, readOnly),
            }),
          );
        }
      }
      pos = line.to + 1;
    }
  }

  return builder.finish();
}
