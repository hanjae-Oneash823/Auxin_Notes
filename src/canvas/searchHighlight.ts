import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { findWordRanges } from './cardSearch';

const hitMark = Decoration.mark({ class: 'canvas-search-hit' });

/** Sets the search words the editor marks. */
export const setSearchWords = StateEffect.define<readonly string[]>();

/** Marks every occurrence of the current search words in a card's text. */
export const searchHighlight = StateField.define<{ words: readonly string[]; decorations: DecorationSet }>({
  create: () => ({ words: [], decorations: Decoration.none }),
  update(value, transaction) {
    const words = transaction.effects.reduce((current, effect) => (effect.is(setSearchWords) ? effect.value : current), value.words);
    if (words === value.words && !transaction.docChanged) return value;
    const ranges = findWordRanges(transaction.state.doc.toString(), words).map(({ from, to }) => hitMark.range(from, to));
    return { words, decorations: Decoration.set(ranges) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});
