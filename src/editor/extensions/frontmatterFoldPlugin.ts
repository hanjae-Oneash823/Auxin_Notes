import { type EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { parseFrontmatter } from '../../vault/parseFrontmatter';
import type { NoteFrontmatter } from '../../vault/types';

class FrontmatterFoldWidget extends WidgetType {
  constructor(private readonly summary: string) {
    super();
  }

  eq(other: FrontmatterFoldWidget) {
    return other.summary === this.summary;
  }

  toDOM(view: EditorView) {
    const bar = document.createElement('div');
    bar.textContent = this.summary;
    bar.title = 'click to edit properties';
    bar.style.fontFamily = 'var(--font-family)';
    bar.style.fontSize = '0.72rem';
    bar.style.color = 'var(--color-fg)';
    bar.style.opacity = 'var(--fg-opacity-faint)';
    bar.style.padding = '2px 0';
    bar.style.cursor = 'pointer';
    bar.addEventListener('mouseenter', () => {
      bar.style.opacity = 'var(--fg-opacity-muted)';
    });
    bar.addEventListener('mouseleave', () => {
      bar.style.opacity = 'var(--fg-opacity-faint)';
    });
    bar.addEventListener('click', () => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
      view.focus();
    });
    return bar;
  }
}

function summarize(frontmatter: Partial<NoteFrontmatter>): string {
  const parts: string[] = [];
  if (frontmatter.created) {
    const date = new Date(frontmatter.created);
    if (!Number.isNaN(date.getTime())) {
      parts.push(date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));
    }
  }
  if (frontmatter.tags && frontmatter.tags.length > 0) {
    parts.push(`tags: ${frontmatter.tags.join(', ')}`);
  }
  return parts.length > 0 ? parts.join('   ·   ') : 'properties';
}

function build(state: EditorState, readOnly: boolean): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const raw = state.doc.toString();
  const { frontmatter, body } = parseFrontmatter(raw);
  const blockEnd = raw.length - body.length;
  if (blockEnd === 0) return builder.finish();

  // Strictly less-than: a cursor sitting exactly at blockEnd (e.g. the
  // initial position Editor.tsx places it at, right after the block) counts
  // as "in the body", not "still inside the frontmatter" — otherwise the
  // block would never fold on open. In reading mode, cursor position is
  // ignored entirely — always folded, since there's nothing to edit.
  const selection = state.selection.main;
  const cursorInsideBlock = !readOnly && selection.from < blockEnd;
  if (cursorInsideBlock) return builder.finish();

  builder.add(
    0,
    blockEnd,
    Decoration.replace({ widget: new FrontmatterFoldWidget(summarize(frontmatter)), block: true }),
  );
  return builder.finish();
}

/**
 * Folds the leading YAML frontmatter block (id/created/modified/tags) down
 * to a single faint metadata line — same dual-mode rule as links/images:
 * cursor elsewhere in the doc → folded summary, cursor inside the block →
 * raw text so it's still directly editable. `Editor.tsx` places the initial
 * cursor after the block on open so it's folded by default, not revealed
 * just because CodeMirror's default selection is doc position 0.
 *
 * A StateField, not a ViewPlugin, because CM6 requires block-level
 * decorations to come from state (they affect layout, which is computed
 * before view plugins run) — a ViewPlugin providing `block: true`
 * decorations throws `RangeError: Block decorations may not be specified
 * via plugins` at runtime.
 */
export function createFrontmatterFoldPlugin(readOnly: boolean) {
  return StateField.define<DecorationSet>({
    create(state) {
      return build(state, readOnly);
    },
    update(decorations, tr) {
      if (tr.docChanged || tr.selection) {
        return build(tr.state, readOnly);
      }
      return decorations.map(tr.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
