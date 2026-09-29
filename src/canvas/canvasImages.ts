import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { blobToBase64, extensionForMimeType } from '../vault/imageBlob';

const IMAGE_FILTER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

/** Image `File`s from a paste or drop `DataTransfer`, ignoring everything else. */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  // `items`, not `files`: WKWebView exposes a clipboard screenshot only there.
  return Array.from(data?.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .flatMap((item) => item.getAsFile() ?? []);
}

/** Saves a pasted/dropped image into the vault's `attachments/` folder (same
 *  command the note editor uses) and returns its vault-relative path. */
export async function saveImageFile(vaultRoot: string, file: File): Promise<string> {
  const fileName = file.name || `pasted-image.${extensionForMimeType(file.type)}`;
  return invoke<string>('save_image_data', { vaultRoot, base64Data: await blobToBase64(file), fileName });
}

/** File-picker import: copies each chosen image into `attachments/` and
 *  returns the vault-relative paths (empty if the dialog was cancelled). */
export async function pickAndCopyImages(vaultRoot: string): Promise<string[]> {
  const selected = await open({ multiple: true, filters: [{ name: 'Images', extensions: IMAGE_FILTER_EXTENSIONS }] });
  if (!selected) return [];
  const sources = Array.isArray(selected) ? selected : [selected];
  return Promise.all(sources.map((sourcePath) => invoke<string>('copy_image_file', { vaultRoot, sourcePath })));
}
