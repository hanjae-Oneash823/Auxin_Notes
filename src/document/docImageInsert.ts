import type { Editor } from '@tiptap/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { imageFilesFrom, pickAndCopyImages, saveImageFile } from '../canvas/canvasImages';
import { pageGeometry, type DocPageSettings } from '../vault/docTypes';

function naturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('could not read the image'));
    img.src = src;
  });
}

/** Inserts one vault-relative image as a `docImage`, sized to fit the text column. */
async function insertImage(editor: Editor, vaultRoot: string, src: string, page: DocPageSettings): Promise<void> {
  const { width, height } = await naturalSize(convertFileSrc(`${vaultRoot}/${src}`));
  const geometry = pageGeometry(page);
  const columnWidth = geometry.pageWidth - geometry.marginLeft - geometry.marginRight;
  const imgW = Math.min(width, columnWidth);
  const ratio = height / width;
  editor
    .chain()
    .focus()
    .insertContent({ type: 'docImage', attrs: { src, ratio, imgW, frameW: imgW, frameH: imgW * ratio, panX: 0, panY: 0, align: 'left' } })
    .run();
}

async function insertAll(editor: Editor, vaultRoot: string, paths: string[], page: DocPageSettings): Promise<void> {
  for (const path of paths) await insertImage(editor, vaultRoot, path, page);
}

/** Toolbar button: pick images from disk (copied into `attachments/`). */
export async function pickAndInsertImages(editor: Editor, vaultRoot: string, page: DocPageSettings): Promise<void> {
  await insertAll(editor, vaultRoot, await pickAndCopyImages(vaultRoot), page);
}

/** Paste/drop: returns true (handled) when the transfer carried image files. */
export function insertDroppedImages(
  editor: Editor,
  vaultRoot: string,
  data: DataTransfer | null,
  page: DocPageSettings,
  onError: (error: unknown) => void,
): boolean {
  const files = imageFilesFrom(data);
  if (files.length === 0) return false;
  void Promise.all(files.map((file) => saveImageFile(vaultRoot, file)))
    .then((paths) => insertAll(editor, vaultRoot, paths, page))
    .catch(onError);
  return true;
}
