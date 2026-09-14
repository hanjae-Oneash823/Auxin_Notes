import { convertFileSrc } from '@tauri-apps/api/core';
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
    outer.style.margin = '5px 0';

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

    // `convertFileSrc` streams the file straight to the webview via the
    // asset protocol (scope widened per-vault in vaultStore.ts) rather than
    // round-tripping it through a command as a base64 `data:` URL — no
    // async request or cache needed, it's a synchronous URL construction.
    img.src = convertFileSrc(this.absolutePath);
    img.onerror = () => {
      img.replaceWith(document.createTextNode(`[image not found: ${this.alt}]`));
    };

    box.appendChild(img);
    if (!this.readOnly) {
      box.appendChild(this.createResizeHandle(view, img));
    }
    outer.appendChild(box);
    outer.appendChild(this.createCaptionArea(view, box));
    return outer;
  }

  /** Caption reuses the same alt text the `|width` suffix already lives in
   *  (see file header), so committing a caption is just another rewrite of
   *  this widget's source range — the same mechanism the resize handle uses. */
  private createCaptionArea(view: EditorView, box: HTMLDivElement): HTMLDivElement {
    const row = document.createElement('div');
    row.style.marginTop = '4px';
    row.style.fontSize = '13px';
    row.style.lineHeight = '1.4';
    row.style.color = 'var(--fg-muted)';
    row.style.fontFamily = 'var(--font-family)';
    row.style.display = this.alt ? 'block' : 'none';

    const text = document.createElement('span');
    text.textContent = this.alt;
    row.appendChild(text);

    if (this.readOnly) return row;

    text.style.cursor = 'pointer';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.alt;
    input.placeholder = 'Add a caption…';
    input.style.display = 'none';
    input.style.width = '100%';
    input.style.maxWidth = '100%';
    input.style.boxSizing = 'border-box';
    input.style.background = 'transparent';
    input.style.border = 'none';
    input.style.borderBottom = '1px solid var(--fg-muted)';
    input.style.color = 'var(--color-fg)';
    input.style.fontSize = '13px';
    input.style.fontFamily = 'var(--font-family)';
    input.style.textAlign = 'center';
    input.style.padding = '2px 0';
    input.addEventListener('mousedown', (event) => event.stopPropagation());
    row.appendChild(input);

    const commit = () => {
      const value = input.value.trim();
      input.style.display = 'none';
      text.style.display = value ? 'inline' : 'none';
      row.style.display = value ? 'block' : 'none';
      if (value === this.alt) return;
      const altText = this.width !== null ? formatAlt(value, this.width) : value;
      const insert = `![${altText}](${this.url})`;
      view.dispatch({ changes: { from: this.from, to: this.to, insert } });
    };

    const cancel = () => {
      input.value = this.alt;
      input.style.display = 'none';
      text.style.display = this.alt ? 'inline' : 'none';
      row.style.display = this.alt ? 'block' : 'none';
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
        input.blur();
      }
    });
    input.addEventListener('blur', commit);

    const enterEdit = () => {
      row.style.display = 'block';
      text.style.display = 'none';
      input.style.display = 'block';
      input.focus();
      input.select();
    };

    text.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    text.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      enterEdit();
    });

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Aa';
    button.title = this.alt ? 'Edit caption' : 'Add caption';
    button.style.position = 'absolute';
    button.style.left = '4px';
    button.style.top = '4px';
    button.style.padding = '2px 6px';
    button.style.fontSize = '11px';
    button.style.lineHeight = '1.4';
    button.style.fontFamily = 'var(--font-family)';
    button.style.color = 'var(--color-fg)';
    button.style.background = 'var(--fg-faint)';
    button.style.backdropFilter = 'blur(4px)';
    button.style.border = '1px solid var(--fg-muted)';
    button.style.borderRadius = '2px';
    button.style.cursor = 'pointer';
    button.style.opacity = this.alt ? '1' : '0';
    button.style.transition = 'opacity var(--ease-fast)';

    box.addEventListener('mouseenter', () => (button.style.opacity = '1'));
    box.addEventListener('mouseleave', () => {
      if (!this.alt && input.style.display === 'none') button.style.opacity = '0';
    });

    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      enterEdit();
    });

    box.appendChild(button);
    return row;
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
    handle.style.background = 'var(--color-fg)';
    handle.style.border = '1px solid var(--color-bg)';
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
