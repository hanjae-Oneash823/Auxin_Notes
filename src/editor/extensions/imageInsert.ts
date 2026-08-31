import { EditorView } from '@codemirror/view';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const IMAGE_FILTER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function insertMarkdownImage(view: EditorView, relPath: string): void {
  const pos = view.state.selection.main.head;
  const insert = `![](${relPath})`;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
  });
  view.focus();
}

/**
 * Used for both paste and drag-drop — both hand over a `File`/`Blob` rather
 * than a filesystem path (drag-drop `File.path` isn't reliably exposed
 * inside the webview), so both save via base64-encoded bytes.
 */
export async function insertImageBlob(
  view: EditorView,
  vaultRoot: string,
  file: Blob,
  suggestedName?: string,
): Promise<void> {
  const ext = EXTENSION_BY_MIME[file.type] ?? 'png';
  const fileName = suggestedName?.trim() || `pasted-image.${ext}`;
  const base64Data = await blobToBase64(file);
  const relPath = await invoke<string>('save_image_data', { vaultRoot, base64Data, fileName });
  insertMarkdownImage(view, relPath);
}

/**
 * File-picker path — the chosen file already has a path on disk, so this
 * copies it directly rather than round-tripping through base64.
 */
export async function pickAndInsertImage(view: EditorView, vaultRoot: string): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Images', extensions: IMAGE_FILTER_EXTENSIONS }],
  });
  if (!selected || Array.isArray(selected)) return;
  const relPath = await invoke<string>('copy_image_file', { vaultRoot, sourcePath: selected });
  insertMarkdownImage(view, relPath);
}
