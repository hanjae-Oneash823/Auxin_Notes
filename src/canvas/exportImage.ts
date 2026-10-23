import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { toPng } from 'html-to-image';
import type { Rect } from './canvasGeometry';

/** Space kept around the cards — arrows and labels can bulge past them. */
const EXPORT_PADDING_PX = 48;
/** Card text is ~14px on the board; at 3× that is ~43px tall — crisp even zoomed in. */
const TARGET_PIXEL_RATIO = 3;
/** Below this, ordinary card text (~14px) comes out under ~21px and gets hard to read. */
export const READABLE_MIN_PIXEL_RATIO = 1.5;
/** WebKit's largest canvas: 16384px a side, 268M pixels. */
const MAX_CANVAS_SIDE_PX = 16_384;
const MAX_CANVAS_PIXELS = 268_000_000;
/** Each failed attempt (WebKit errors, or silently blanks, a canvas it can't
 *  allocate) retries at this fraction of the previous ratio. */
const RETRY_RATIO_STEPS = [1, 0.75, 0.5, 0.35];
const LEGACY_SAFE_PIXELS = 16_000_000;
const MIN_ATTEMPT_RATIO = 0.25;
const BLANK_DATA_URL = 'data:,';
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

/** What went wrong, as text. The rasterizer rejects with a bare DOM `Event`
 *  (from an `<img>` that failed to load) which `String()` turns into
 *  "[object Event]". */
export function describeExportError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error instanceof Event) {
    const src = error.target instanceof HTMLImageElement ? error.target.src : '';
    return `an image failed to load while rendering${src ? ` (${src.slice(0, 60)}…)` : ''}`;
  }
  return String(error);
}

function loadImage(src: string, what: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${what}`));
    img.src = src;
  });
}

/** Loads every card image's file straight from disk, for painting onto the
 *  result. Kept apart from the DOM's own `<img>`s: a full-resolution file as a
 *  `data:` URL inside the board's DOM makes the rasterizer's SVG too big for
 *  WebKit to load. */
function loadCardImageFiles(images: readonly HTMLImageElement[], vaultRoot: string): Promise<HTMLImageElement[]> {
  return Promise.all(
    images.map(async (img) => {
      const vaultPath = img.dataset.vaultPath ?? '';
      const base64 = await invoke<string>('read_file_base64', { path: `${vaultRoot}/${vaultPath}` });
      return loadImage(`data:${mimeTypeFor(vaultPath)};base64,${base64}`, `the image ${vaultPath}`);
    }),
  );
}

/** An empty SVG with the file's own dimensions: stands in for a card image
 *  during the capture, so the card keeps its size without carrying the pixels. */
function placeholderFor(file: HTMLImageElement): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${file.naturalWidth}" height="${file.naturalHeight}"/>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Ratios to try, best first: as high as 3× while the canvas stays within
 *  WebKit's limits, then progressively smaller if an attempt fails. */
function exportRatios(width: number, height: number): number[] {
  const best = Math.min(
    TARGET_PIXEL_RATIO,
    Math.sqrt(MAX_CANVAS_PIXELS / (width * height)),
    MAX_CANVAS_SIDE_PX / Math.max(width, height),
  );
  const legacySafe = Math.sqrt(LEGACY_SAFE_PIXELS / (width * height));
  return [...RETRY_RATIO_STEPS.map((step) => best * step), legacySafe]
    .filter((ratio) => ratio >= MIN_ATTEMPT_RATIO)
    .sort((a, b) => b - a);
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
 * WebKit web views: they are hidden for the capture (swapped for an empty
 * placeholder of the same shape, so the layout doesn't change) and painted onto
 * the result afterwards, straight from their files, at the spot each occupies
 * on the board.
 *
 * Resolves with the pixel ratio actually used (callers warn when it is too low
 * for card text to read).
 */
export async function exportBoardAsImage(
  worldLayer: HTMLElement,
  vaultRoot: string,
  bounds: Rect,
  zoom: number,
  path: string,
): Promise<number> {
  const width = Math.ceil(bounds.w + 2 * EXPORT_PADDING_PX);
  const height = Math.ceil(bounds.h + 2 * EXPORT_PADDING_PX);
  const pixelRatios = exportRatios(width, height);
  const background = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim() || FALLBACK_BACKGROUND;

  const images = Array.from(worldLayer.querySelectorAll<HTMLImageElement>('img[data-vault-path]'));
  const originals = images.map((img) => ({ src: img.src, visibility: img.style.visibility }));
  try {
    const files = await loadCardImageFiles(images, vaultRoot);

    // Where each image sits in board coordinates (the layer's origin is its
    // top-left; screen distances divide by the current zoom).
    const layerRect = worldLayer.getBoundingClientRect();
    const placements = images.map((img, index) => {
      const rect = img.getBoundingClientRect();
      return { img: files[index], x: (rect.left - layerRect.left) / zoom, y: (rect.top - layerRect.top) / zoom, w: rect.width / zoom, h: rect.height / zoom };
    });

    images.forEach((img, index) => {
      img.src = placeholderFor(files[index]);
      img.style.visibility = 'hidden';
    });
    const renderAt = async (pixelRatio: number): Promise<string> => {
      const boardPng = await toPng(worldLayer, {
        width,
        height,
        pixelRatio,
        backgroundColor: background,
        style: { transform: `translate(${EXPORT_PADDING_PX - bounds.x}px, ${EXPORT_PADDING_PX - bounds.y}px)`, transformOrigin: '0 0' },
      });
      const board = await loadImage(boardPng, 'the rendered board');
      const scale = board.naturalWidth / width;
      const canvas = document.createElement('canvas');
      canvas.width = board.naturalWidth;
      canvas.height = board.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2D canvas available');
      // The default ('low') visibly softens a big photo scaled down onto the board.
      context.imageSmoothingQuality = 'high';
      context.drawImage(board, 0, 0);
      for (const { img, x, y, w, h } of placements) {
        context.drawImage(img, (x - bounds.x + EXPORT_PADDING_PX) * scale, (y - bounds.y + EXPORT_PADDING_PX) * scale, w * scale, h * scale);
      }
      const url = canvas.toDataURL('image/png');
      if (url === BLANK_DATA_URL) throw new Error('the canvas was too large to export');
      return url;
    };

    let dataUrl: string | null = null;
    let usedRatio = 0;
    let lastError: unknown = null;
    for (const pixelRatio of pixelRatios) {
      try {
        dataUrl = await renderAt(pixelRatio);
        usedRatio = pixelRatio;
        break;
      } catch (error: unknown) {
        lastError = error;
      }
    }
    if (dataUrl === null) throw lastError;
    await invoke('write_binary_file', { path, base64Data: dataUrl.slice(dataUrl.indexOf(',') + 1) });
    return usedRatio;
  } finally {
    images.forEach((img, index) => {
      img.src = originals[index].src;
      img.style.visibility = originals[index].visibility;
    });
  }
}
