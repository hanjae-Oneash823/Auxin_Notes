import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { invoke } from '@tauri-apps/api/core';
import { syncFile } from '../vault/syncEngine';
import { PAPER_SIZES, pageGeometry, parseDocFile, type DocFile, type DocPageSettings } from '../vault/docTypes';
import { buildDocExtensions } from './docExtensions';
import { insertDroppedImages, pickAndInsertImages } from './docImageInsert';
import { useCropMode } from './DocImage';
import { DocToolbar } from './DocToolbar';
import './document.css';

const AUTOSAVE_DELAY_MS = 500;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

interface DocumentViewProps {
  /** Absolute path of the `.axdoc` file. */
  path: string;
  vaultRoot: string;
  /** Reading mode (the footer toggle): the sheets can be read and exported, not edited. */
  isReadOnly: boolean;
  /** Called after every autosave so App.tsx can refresh the note list. */
  onSynced: () => void;
}

/** Loads the file, then hands the parsed document to the editor (which needs its
 *  initial content at construction). */
export function DocumentView(props: DocumentViewProps) {
  const [loaded, setLoaded] = useState<{ doc: DocFile } | { error: string } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setLoaded(null);
    invoke<string>('read_note', { path: props.path })
      .then((raw) => isCurrent && setLoaded({ doc: parseDocFile(raw) }))
      .catch((error: unknown) => isCurrent && setLoaded({ error: messageOf(error) }));
    return () => {
      isCurrent = false;
    };
  }, [props.path]);

  if (loaded === null) return <div className="p-4 text-fg-faint">Loading document…</div>;
  if ('error' in loaded) return <div className="p-4 text-accent-link-broken">Couldn’t open this document: {loaded.error}</div>;
  return <DocumentEditor key={props.path} {...props} doc={loaded.doc} />;
}

function DocumentEditor({ path, vaultRoot, isReadOnly, onSynced, doc }: DocumentViewProps & { doc: DocFile }) {
  const [page, setPage] = useState<DocPageSettings>(doc.page);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Refs, not state: the save timer and the unmount flush must see the latest values.
  const pageRef = useRef(page);
  const latestContent = useRef<JSONContent>(doc.content);
  const saveTimer = useRef<number | undefined>(undefined);
  const setCropping = useCropMode((store) => store.setCropping);

  const extensions = useMemo(() => buildDocExtensions(vaultRoot, doc.page), [vaultRoot, doc.page]);
  const editor = useEditor({
    extensions,
    content: doc.content,
    editable: !isReadOnly,
    editorProps: {
      handlePaste: (_view, event) => insertFromTransfer(event.clipboardData),
      handleDrop: (_view, event) => insertFromTransfer(event.dataTransfer),
    },
    onUpdate: ({ editor: updated }) => {
      latestContent.current = updated.getJSON();
      scheduleSave();
    },
    onSelectionUpdate: ({ editor: updated }) => {
      const selection = updated.state.selection as { node?: { type: { name: string } } };
      if (selection.node?.type.name !== 'docImage') setCropping(false);
    },
  });

  function insertFromTransfer(data: DataTransfer | null): boolean {
    return editor ? insertDroppedImages(editor, vaultRoot, data, pageRef.current, (error) => setSaveError(`couldn’t add the image: ${messageOf(error)}`)) : false;
  }

  async function save() {
    saveTimer.current = undefined;
    const file: DocFile = { version: 1, page: pageRef.current, content: latestContent.current };
    try {
      await invoke('write_note', { path, content: JSON.stringify(file) });
      await syncFile(vaultRoot, path);
      onSynced();
      setSaveError(null);
    } catch (error: unknown) {
      setSaveError(`couldn’t save: ${messageOf(error)}`);
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  }

  // Flush a pending save when the tab closes, so the last keystrokes are never lost.
  useEffect(
    () => () => {
      if (saveTimer.current !== undefined) {
        window.clearTimeout(saveTimer.current);
        void save();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads refs only; must run once, on unmount
    [],
  );

  useEffect(() => {
    editor?.setEditable(!isReadOnly);
  }, [editor, isReadOnly]);

  // Print rules in document.css only apply under this class (and only inside @media print).
  useEffect(() => {
    document.documentElement.classList.add('doc-printing');
    return () => document.documentElement.classList.remove('doc-printing');
  }, []);

  function changePage(next: DocPageSettings) {
    pageRef.current = next;
    setPage(next);
    editor?.commands.updatePageSize(pageGeometry(next));
    scheduleSave();
  }

  function exportPdf() {
    invoke('print_window').catch((error: unknown) => setSaveError(`couldn’t open the print dialog: ${messageOf(error)}`));
  }

  if (!editor) return null;
  const { widthPx, heightPx } = PAPER_SIZES[page.size];
  const [paperW, paperH] = page.orientation === 'landscape' ? [heightPx, widthPx] : [widthPx, heightPx];
  return (
    <div className="doc-root flex h-full flex-col">
      <style>{`@page { size: ${paperW}px ${paperH}px; margin: 0; }`}</style>
      {!isReadOnly && (
        <DocToolbar
          editor={editor}
          page={page}
          onPageChange={changePage}
          onInsertImage={() => void pickAndInsertImages(editor, vaultRoot, pageRef.current).catch((error: unknown) => setSaveError(`couldn’t add the image: ${messageOf(error)}`))}
          onExportPdf={exportPdf}
        />
      )}
      {saveError && <div className="shrink-0 px-3 py-1 text-accent-link-broken" style={{ fontSize: '0.75rem' }}>{saveError}</div>}
      <div className="doc-scroll min-h-0 flex-1 overflow-auto">
        <div className="doc-sheet" style={{ width: 'max-content', margin: '0 auto', padding: '32px 32px 80px' }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
