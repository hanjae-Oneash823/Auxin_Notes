import { useEffect, useRef } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { drawSelection, EditorView, keymap } from '@codemirror/view';
import { createLinkChipPlugin } from '../editor/extensions/linkChipWidget';
import { createWikilinkAutocomplete } from '../editor/extensions/wikilinkAutocomplete';

interface CardTextEditorProps {
  vaultRoot: string;
  /** Initial content only — this mounts CodeMirror once per card instance
   *  and reports changes out via `onChange`, the same mount-once pattern
   *  `Editor.tsx` uses for a full note; it deliberately doesn't re-sync from
   *  a later `value` prop change (a card's own board never edits its text
   *  from outside this component while it's mounted). */
  value: string;
  onChange: (value: string) => void;
  onNavigate: (path: string) => void;
  readOnly: boolean;
  autoFocus?: boolean;
  /** False makes the whole editor inert — unfocusable, unselectable, and
   *  transparent to the pointer — so the card around it (not its text) takes
   *  every click and drag. Flipping to true focuses the editor. */
  isEditable: boolean;
}

/** A card's inline markdown mini-editor — deliberately not the full
 *  `markdownSetup` bundle (`src/editor/extensions/markdownSetup.ts`): a
 *  small card has no use for tables, TeX, heading folds, or image widgets.
 *  Only pulls in wikilink rendering (`createLinkChipPlugin`) and `[[`
 *  autocomplete (`createWikilinkAutocomplete`), both self-contained enough
 *  to not need the rest of the bundle around them. */
export function CardTextEditor({ vaultRoot, value, onChange, onNavigate, readOnly, autoFocus, isEditable }: CardTextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        // Without this, the mini editor has no visible cursor at all — the
        // main Editor.tsx gets one implicitly by pulling in the same
        // extension via markdownSetup.ts; this editor's smaller, hand-picked
        // extension list needs it added explicitly.
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        EditorView.lineWrapping,
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        createLinkChipPlugin(vaultRoot, onNavigate, readOnly),
        ...(readOnly ? [] : [createWikilinkAutocomplete(vaultRoot)]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.theme({
          '&': { fontSize: '0.82rem' },
          // Never scroll: the card sizes itself to the text, and letting the
          // scroller show bars (as the cursor/selection layers briefly
          // overflow it on focus) makes the card jump taller for a moment.
          '.cm-scroller': { fontFamily: 'var(--font-family)', overflow: 'hidden' },
          // Symmetric padding, and CodeMirror's own lopsided per-line inset
          // (0 2px 0 6px) zeroed — otherwise text sits off-center in the card.
          '.cm-content': { padding: '18px 22px', caretColor: 'var(--accent-caret)' },
          '.cm-line': { padding: '0' },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-caret)', borderLeftWidth: '1.5px' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;
    if (autoFocus) view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally excludes `value`/`autoFocus`/`onNavigate` — see the
    // mount-once doc comment above; only vaultRoot/readOnly changing
    // warrants a fresh instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultRoot, readOnly]);

  // Entering edit mode (a click on the card) hands the caret to the editor,
  // at the end of the text. Runs after the render that clears `inert`.
  useEffect(() => {
    const view = viewRef.current;
    if (!isEditable || !view) return;
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
  }, [isEditable]);

  return (
    <div
      ref={containerRef}
      inert={!isEditable}
      className="w-full"
      // A drag started here must not also start the card's own drag (its
      // handler lives on the card's header bar, not the body) — CodeMirror
      // needs ordinary pointer events for text selection/cursor placement.
      onPointerDown={(event) => {
        if (isEditable) event.stopPropagation();
      }}
    />
  );
}
