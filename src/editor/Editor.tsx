import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { invoke } from '@tauri-apps/api/core';
import { Image } from '@phosphor-icons/react';
import { markdownSetup } from './extensions/markdownSetup';
import { pickAndInsertImage } from './extensions/imageInsert';
import { refreshLinkChipsEffect } from './extensions/linkChipWidget';
import { registerEditorView, unregisterEditorView } from './editorRegistry';
import { parseFrontmatter } from '../vault/parseFrontmatter';
import { titleFromPath } from '../vault/noteTitle';
import { useVaultStore } from '../vault/vaultStore';

const AUTOSAVE_DELAY_MS = 500;

interface EditorProps {
  path: string;
  vaultRoot: string;
  /** Called with a vault-relative path when a resolved/stale link chip is clicked. */
  onNavigate: (path: string) => void;
  /** Renames the note (actually moves the .md file) — backs the title field. */
  onRenameTitle: (newTitle: string) => Promise<void>;
  /** Reading mode: fully rendered, no cursor-based syntax reveal, no edits. */
  readOnly: boolean;
}

export function Editor({ path, vaultRoot, onNavigate, onRenameTitle, readOnly }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTitle = titleFromPath(path);
  // Re-initialized fresh on every genuine note switch — App.tsx remounts
  // this whole component (key={activePath}) whenever `path` changes,
  // including right after a successful rename here.
  const [titleValue, setTitleValue] = useState(currentTitle);
  const syncVersion = useVaultStore((state) => state.syncVersion);

  async function commitTitle() {
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === currentTitle) {
      setTitleValue(currentTitle);
      return;
    }
    try {
      await onRenameTitle(trimmed);
    } catch {
      // Rejected (empty/"/"/collision/etc.) — the rejection's message is
      // already surfaced by App.tsx's rename status line; just revert.
      setTitleValue(currentTitle);
    }
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setTitleValue(currentTitle);
      event.currentTarget.blur();
    }
  }

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
          ...markdownSetup(vaultRoot, onNavigate, readOnly),
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
      // But the file at `path` can have been renamed out from under us (this
      // editor's own title field, or a rename triggered elsewhere, e.g. the
      // sidebar — renameEngine.ts already flushes the live buffer to the old
      // path before renaming) — probe existence first so this can't
      // resurrect a stale duplicate at a filename that's deliberately gone.
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        const view = viewRef.current;
        if (view) {
          const content = view.state.doc.toString();
          void invoke('read_note', { path })
            .then(() => invoke('write_note', { path, content }))
            .catch(() => {});
        }
      }
      unregisterEditorView(path);
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [path, vaultRoot, readOnly]);

  // Separate from the mount effect above on purpose: a vault-wide sync (some
  // other note created/renamed/edited) shouldn't remount this editor and
  // reset cursor/undo history — it just needs link chips to re-check their
  // resolution status, which this cheap effect-only transaction triggers
  // without touching the document itself.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: refreshLinkChipsEffect.of(null) });
  }, [syncVersion]);

  return (
    <div className="flex h-full flex-col">
      <div
        className="mx-auto flex w-full items-center gap-2"
        style={{ maxWidth: '760px', padding: 'var(--space-content-md) var(--space-content-lg) 0' }}
      >
        <input
          value={titleValue}
          onChange={(event) => setTitleValue(event.target.value)}
          onKeyDown={handleTitleKeyDown}
          onBlur={() => void commitTitle()}
          readOnly={readOnly}
          placeholder="untitled"
          className="w-full flex-1 border-none bg-transparent text-fg-prominent outline-none"
          style={{ fontFamily: 'var(--font-family)', fontSize: '1.6em', fontWeight: 700 }}
        />
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              const view = viewRef.current;
              if (view) void pickAndInsertImage(view, vaultRoot);
            }}
            title="Insert image"
            className="flex items-center text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
          >
            <Image size={16} weight="regular" />
          </button>
        )}
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto" />
    </div>
  );
}
