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
}

/** A card's inline markdown mini-editor — deliberately not the full
 *  `markdownSetup` bundle (`src/editor/extensions/markdownSetup.ts`): a
 *  small card has no use for tables, TeX, heading folds, or image widgets.
 *  Only pulls in wikilink rendering (`createLinkChipPlugin`) and `[[`
 *  autocomplete (`createWikilinkAutocomplete`), both self-contained enough
 *  to not need the rest of the bundle around them. */
export function CardTextEditor({ vaultRoot, value, onChange, onNavigate, readOnly, autoFocus }: CardTextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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
          '&': { fontSize: '0.82rem', height: '100%' },
          '.cm-scroller': { fontFamily: 'var(--font-family)', overflow: 'auto' },
          '.cm-content': { padding: '6px 8px', caretColor: 'var(--accent-caret)' },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-caret)', borderLeftWidth: '1.5px' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });
    if (autoFocus) view.focus();

    return () => view.destroy();
    // Intentionally excludes `value`/`autoFocus`/`onNavigate` — see the
    // mount-once doc comment above; only vaultRoot/readOnly changing
    // warrants a fresh instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultRoot, readOnly]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      // A drag started here must not also start the card's own drag (its
      // handler lives on the card's header bar, not the body) — CodeMirror
      // needs ordinary pointer events for text selection/cursor placement.
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}
