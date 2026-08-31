import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { insertImageBlob } from './imageInsert';

function firstImageFile(files: Iterable<File>): File | undefined {
  for (const file of files) {
    if (file.type.startsWith('image/')) return file;
  }
  return undefined;
}

/**
 * Pasting or dragging-and-dropping an image into the editor saves it into
 * the vault's attachments folder and inserts a markdown image link at the
 * drop/cursor position, instead of falling through to CodeMirror's default
 * (pasting nothing useful, or dropping as plain text).
 */
export function createImageDropPastePlugin(vaultRoot: string): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const file = firstImageFile(event.clipboardData?.files ?? []);
      if (!file) return false;
      event.preventDefault();
      void insertImageBlob(view, vaultRoot, file, file.name);
      return true;
    },
    drop(event, view) {
      const file = firstImageFile(event.dataTransfer?.files ?? []);
      if (!file) return false;
      event.preventDefault();
      void insertImageBlob(view, vaultRoot, file, file.name);
      return true;
    },
  });
}
