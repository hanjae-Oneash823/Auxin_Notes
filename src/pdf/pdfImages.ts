import { ImageKind, OPS, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

type Matrix = readonly [number, number, number, number, number, number];

/** An image a page draws, with where it lands at scale 1 (CSS px from the page's top-left). */
export interface PageImage {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Either an object id to resolve from the page, or the pixels themselves (inline images). */
  source: { objId: string } | { inline: unknown };
}

/** The pixels pdf.js hands back for a decoded image: a bitmap, or raw samples of a given kind. */
interface DecodedImage {
  width: number;
  height: number;
  bitmap?: ImageBitmap;
  data?: Uint8Array | Uint8ClampedArray;
  kind?: number;
}

/** Common objects (shared across pages, e.g. repeated logos) are named with this prefix. */
const COMMON_OBJECT_PREFIX = 'g_';

/** pdf.js's `Util.transform`: the matrix that applies `second`, then `first`. */
function multiply(first: Matrix, second: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = first;
  const [a2, b2, c2, d2, e2, f2] = second;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** Bounding box of the unit square an image is painted into, under `matrix`. */
function unitSquareBounds(matrix: Matrix): Pick<PageImage, 'left' | 'top' | 'width' | 'height'> {
  const [a, b, c, d, e, f] = matrix;
  const xs = [e, e + a, e + c, e + a + c];
  const ys = [f, f + b, f + d, f + b + d];
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

async function listImages(page: PDFPageProxy): Promise<PageImage[]> {
  const operatorList = await page.getOperatorList();
  const images: PageImage[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = page.getViewport({ scale: 1 }).transform as unknown as Matrix;

  operatorList.fnArray.forEach((fn, index) => {
    const args = operatorList.argsArray[index] as unknown[] | null;
    switch (fn) {
      case OPS.save:
        stack.push(ctm);
        break;
      case OPS.restore:
        ctm = stack.pop() ?? ctm;
        break;
      case OPS.transform:
        if (args) ctm = multiply(ctm, args as unknown as Matrix);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push(ctm);
        if (args?.[0]) ctm = multiply(ctm, args[0] as Matrix);
        break;
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? ctm;
        break;
      case OPS.paintImageXObject:
        if (typeof args?.[0] === 'string') images.push({ ...unitSquareBounds(ctm), source: { objId: args[0] } });
        break;
      case OPS.paintInlineImageXObject:
        if (args?.[0]) images.push({ ...unitSquareBounds(ctm), source: { inline: args[0] } });
        break;
    }
  });
  return images;
}

const imagesByDoc = new WeakMap<PDFDocumentProxy, Map<number, Promise<PageImage[]>>>();

/** Every image a page paints, in paint order. Cached: walking the operator list isn't free. */
export function findPageImages(doc: PDFDocumentProxy, page: PDFPageProxy): Promise<PageImage[]> {
  const cache = imagesByDoc.get(doc) ?? new Map<number, Promise<PageImage[]>>();
  imagesByDoc.set(doc, cache);
  const cached = cache.get(page.pageNumber);
  if (cached) return cached;
  const pending = listImages(page);
  cache.set(page.pageNumber, pending);
  // A failed walk shouldn't stick: let the next right-click retry.
  pending.catch(() => cache.delete(page.pageNumber));
  return pending;
}

/** The topmost image under a point given in scale-1 page px, if any. */
export function imageAt(images: readonly PageImage[], x: number, y: number): PageImage | null {
  for (let index = images.length - 1; index >= 0; index -= 1) {
    const image = images[index];
    if (x >= image.left && x <= image.left + image.width && y >= image.top && y <= image.top + image.height) return image;
  }
  return null;
}

function resolveObject(page: PDFPageProxy, objId: string): Promise<DecodedImage> {
  const store = objId.startsWith(COMMON_OBJECT_PREFIX) ? page.commonObjs : page.objs;
  return new Promise((resolve) => store.get(objId, resolve));
}

function toImageData({ width, height, data, kind }: DecodedImage): ImageData {
  if (!data) throw new Error('image has no pixel data');
  const rgba = new Uint8ClampedArray(width * height * 4);
  if (kind === ImageKind.RGBA_32BPP) {
    rgba.set(data.subarray(0, rgba.length));
  } else if (kind === ImageKind.RGB_24BPP) {
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      rgba.set(data.subarray(pixel * 3, pixel * 3 + 3), pixel * 4);
      rgba[pixel * 4 + 3] = 255;
    }
  } else if (kind === ImageKind.GRAYSCALE_1BPP) {
    const rowBytes = Math.ceil(width / 8);
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const isSet = (data[row * rowBytes + (column >> 3)] >> (7 - (column & 7))) & 1;
        const offset = (row * width + column) * 4;
        rgba.fill(isSet ? 255 : 0, offset, offset + 3);
        rgba[offset + 3] = 255;
      }
    }
  } else {
    throw new Error(`unsupported image kind ${String(kind)}`);
  }
  return new ImageData(rgba, width, height);
}

async function renderPng(decoded: DecodedImage): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d canvas context');
  if (decoded.bitmap) context.drawImage(decoded.bitmap, 0, 0);
  else context.putImageData(toImageData(decoded), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))), 'image/png'));
}

/** Puts an embedded image on the clipboard as a PNG at its stored resolution. The blob is passed
 *  as a promise so the write starts inside the user gesture while pdf.js is still decoding. */
export function copyPageImage(page: PDFPageProxy, image: PageImage): Promise<void> {
  const decoded = 'objId' in image.source ? resolveObject(page, image.source.objId) : Promise.resolve(image.source.inline as DecodedImage);
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': decoded.then(renderPng) })]);
}
