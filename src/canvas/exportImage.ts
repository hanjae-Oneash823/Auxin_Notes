import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { toPng } from 'html-to-image';
import type { Rect } from './canvasGeometry';

/** Space kept around the cards — arrows and labels can bulge past them. */
const EXPORT_PADDING_PX = 48;
const EXPORT_PIXEL_RATIO = 2;
/** WKWebView refuses canvases past ~16.7M pixels; stay under it by lowering the ratio. */
const MAX_EXPORT_PIXELS = 16_000_000;
const FALLBACK_BACKGROUND = '#0b0b0c';
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/** Asks where to save the PNG. `null` when the user cancels. */
export async function pickImageExportPath(canvasFileName: string): Promise<string | null> {
  const baseName = canvasFileName.replace(/\.[^.]+$/, '') || 'canvas';
  return save({ defaultPath: `${baseName}.png`, filters: [{ name: 'PNG image', extensions: ['png'] }] });
}

function mimeTypeFor(vaultPath: string): string {
  return MIME_BY_EXTENSION[vaultPath.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/png';
}

/** Points every card image at a `data:` URL of its file. Left as the app's
 *  `asset://` URLs, the rasterizer can't fetch them and draws blank boxes. */
async function inlineCardImages(images: readonly HTMLImageElement[], vaultRoot: string): Promise<void> {
  await Promise.all(
    images.map(async (img) => {
      const vaultPath = img.dataset.vaultPath ?? '';
      const base64 = await invoke<string>('read_file_base64', { path: `${vaultRoot}/${vaultPath}` });
      img.src = `data:${mimeTypeFor(vaultPath)};base64,${base64}`;
      await img.decode();
    }),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load the rendered board'));
    img.src = src;
  });
}

/**
 * Renders the board's world layer — every card and arrow inside `bounds`, at
 * its natural size regardless of the current pan and zoom — to a PNG on the
 * board's background color, and writes it to `path`. `worldLayer` is the
 * element the pan/zoom transform is applied to (currently at `zoom`); the
 * capture overrides that transform with one that puts `bounds` at the image's
 * top-left.
 *
 * Card images are not left to the DOM rasterizer, which draws them blank in
 * WebKit web views: they are hidden for the capture (their boxes stay, so the
 * layout doesn't change) and painted onto the result afterwards, straight from
 * their files, at the spot each occupies on the board.
 */
export async function exportBoardAsImage(
  worldLayer: HTMLElement,
  vaultRoot: string,
  bounds: Rect,
  zoom: number,
  path: string,
): Promise<void> {
  const width = Math.ceil(bounds.w + 2 * EXPORT_PADDING_PX);
  const height = Math.ceil(bounds.h + 2 * EXPORT_PADDING_PX);
  const pixelRatio = Math.min(EXPORT_PIXEL_RATIO, Math.sqrt(MAX_EXPORT_PIXELS / (width * height)));
  const background = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim() || FALLBACK_BACKGROUND;

  const images = Array.from(worldLayer.querySelectorAll<HTMLImageElement>('img[data-vault-path]'));
  const originals = images.map((img) => ({ src: img.src, visibility: img.style.visibility }));
  try {
    await inlineCardImages(images, vaultRoot);

    // Where each image sits in board coordinates (the layer's origin is its
    // top-left; screen distances divide by the current zoom).
    const layerRect = worldLayer.getBoundingClientRect();
    const placements = images.map((img) => {
      const rect = img.getBoundingClientRect();
      return { img, x: (rect.left - layerRect.left) / zoom, y: (rect.top - layerRect.top) / zoom, w: rect.width / zoom, h: rect.height / zoom };
    });

    images.forEach((img) => {
      img.style.visibility = 'hidden';
    });
    const boardPng = await toPng(worldLayer, {
      width,
      height,
      pixelRatio,
      backgroundColor: background,
      style: { transform: `translate(${EXPORT_PADDING_PX - bounds.x}px, ${EXPORT_PADDING_PX - bounds.y}px)`, transformOrigin: '0 0' },
    });

    const board = await loadImage(boardPng);
    const scale = board.naturalWidth / width;
    const canvas = document.createElement('canvas');
    canvas.width = board.naturalWidth;
    canvas.height = board.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2D canvas available');
    context.drawImage(board, 0, 0);
    for (const { img, x, y, w, h } of placements) {
      context.drawImage(img, (x - bounds.x + EXPORT_PADDING_PX) * scale, (y - bounds.y + EXPORT_PADDING_PX) * scale, w * scale, h * scale);
    }

    const dataUrl = canvas.toDataURL('image/png');
    await invoke('write_binary_file', { path, base64Data: dataUrl.slice(dataUrl.indexOf(',') + 1) });
  } finally {
    images.forEach((img, index) => {
      img.src = originals[index].src;
      img.style.visibility = originals[index].visibility;
    });
  }
}
