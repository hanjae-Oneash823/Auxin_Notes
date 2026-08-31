import { type EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { parseFrontmatter } from '../../vault/parseFrontmatter';

const HIDDEN_BLOCK = Decoration.replace({ block: true });

function build(state: EditorState, readOnly: boolean): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const raw = state.doc.toString();
  const { body } = parseFrontmatter(raw);
  const blockEnd = raw.length - body.length;
  if (blockEnd === 0) return builder.finish();

  // Strictly less-than: a cursor sitting exactly at blockEnd (e.g. the
  // initial position Editor.tsx places it at, right after the block) counts
  // as "in the body", not "still inside the frontmatter" — otherwise the
  // block would never hide on open. In reading mode, cursor position is
  // ignored entirely — always hidden, since there's nothing to edit.
  const selection = state.selection.main;
  const cursorInsideBlock = !readOnly && selection.from < blockEnd;
  if (cursorInsideBlock) return builder.finish();

  builder.add(0, blockEnd, HIDDEN_BLOCK);
  return builder.finish();
}

/**
 * Hides the leading YAML frontmatter block (id/created/modified/tags)
 * entirely whenever the cursor isn't inside it — no summary bar, no visible
 * trace at all. The note's title has its own dedicated field now
 * (Editor.tsx, driven by the filename), so there's nothing in frontmatter
 * worth surfacing in the body. It's still directly editable by navigating
 * the cursor into it (e.g. Home/Ctrl+Home at the top of the document) if
 * tags or other fields need hand-editing — same dual-mode rule as
 * links/images, just with nothing rendered in the folded state instead of a
 * widget. `Editor.tsx` places the initial cursor after the block on open so
 * it's hidden by default, not revealed just because CodeMirror's default
 * selection is doc position 0.
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
      // Rebuilding this block decoration mid-IME-composition (typing
      // Korean/Japanese/Chinese) crashes CodeMirror's own composition
      // handling — a StateField has no `view.composing`, but CM6 tags
      // composition-driven transactions with this userEvent, so check that
      // instead and just remap positions until composition ends.
      if ((tr.docChanged || tr.selection) && !tr.isUserEvent('input.type.compose')) {
        return build(tr.state, readOnly);
      }
      return decorations.map(tr.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
