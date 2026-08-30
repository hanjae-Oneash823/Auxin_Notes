import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { invoke } from '@tauri-apps/api/core';
import { markdownSetup } from './extensions/markdownSetup';
import { registerEditorView, unregisterEditorView } from './editorRegistry';
import { parseFrontmatter } from '../vault/parseFrontmatter';

const AUTOSAVE_DELAY_MS = 500;

interface EditorProps {
  path: string;
  vaultRoot: string;
  /** Called with a vault-relative path when a resolved/stale link chip is clicked. */
  onNavigate: (path: string) => void;
  /** Reading mode: fully rendered, no cursor-based syntax reveal, no edits. */
  readOnly: boolean;
}

export function Editor({ path, vaultRoot, onNavigate, readOnly }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function scheduleSave(view: EditorView) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        void invoke('write_note', { path, content: view.state.doc.toString() });
      }, AUTOSAVE_DELAY_MS);
    }

    async function mount() {
      const content = await invoke<string>('read_note', { path });
      if (cancelled || !containerRef.current) return;

      // Land the cursor after the frontmatter block, not CodeMirror's default
      // doc-position-0 — otherwise frontmatterFoldPlugin would see the cursor
      // "inside" the block on every open and show it raw instead of folded.
      const { body } = parseFrontmatter(content);
      const bodyStart = content.length - body.length;

      const state = EditorState.create({
        doc: content,
        selection: { anchor: bodyStart, head: bodyStart },
        extensions: [
          ...markdownSetup(vaultRoot, path, onNavigate, readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) scheduleSave(update.view);
          }),
        ],
      });

      viewRef.current = new EditorView({ state, parent: containerRef.current });
      registerEditorView(path, viewRef.current);
    }

    void mount();

    return () => {
      cancelled = true;
      // A pending debounced save must be flushed immediately, not dropped —
      // otherwise switching notes right after typing silently loses the edit.
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        if (viewRef.current) {
          void invoke('write_note', {
            path,
            content: viewRef.current.state.doc.toString(),
          });
        }
      }
      unregisterEditorView(path);
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [path, vaultRoot, readOnly]);

  return <div ref={containerRef} className="h-full overflow-y-auto" />;
}
