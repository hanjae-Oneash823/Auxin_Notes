/** Geometry of a cropped image: a visible frame, and the picture drawn `imgW` wide
 *  at (`panX`, `panY`) inside it. Invariant: the picture always covers the frame
 *  (panX ≤ 0, panX + imgW ≥ frameW, and the same vertically) — a crop never shows
 *  blank space. */
export interface CropBox {
  imgW: number;
  /** Natural height / width of the picture. */
  ratio?: number;
  frameW: number;
  frameH: number;
  panX: number;
  panY: number;
}

/** Which edge/corner is dragged: -1 = left/top, 1 = right/bottom, 0 = not involved. */
export interface HandleDir {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export const MIN_FRAME_PX = 24;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const imgH = (box: CropBox) => box.imgW * (box.ratio ?? 1);

/** Pulls pan back so the picture still covers the frame. */
export function clampCropWindow(box: CropBox): CropBox {
  return {
    ...box,
    panX: clamp(box.panX, Math.min(0, box.frameW - box.imgW), 0),
    panY: clamp(box.panY, Math.min(0, box.frameH - imgH(box)), 0),
  };
}

/** Crop-mode edge/corner drag: moves the frame edges over a fixed picture. */
export function resizeCropWindow(origin: CropBox, handle: HandleDir, dx: number, dy: number): CropBox {
  let { frameW, frameH, panX, panY } = origin;

  if (handle.dx === 1) {
    frameW = clamp(origin.frameW + dx, MIN_FRAME_PX, origin.imgW + origin.panX);
  } else if (handle.dx === -1) {
    // The frame's left edge moves by `shift`; the picture stays put on the page, so pan
    // moves the opposite way. Negative shift can reach at most the picture's own edge.
    const shift = clamp(dx, origin.panX, origin.frameW - MIN_FRAME_PX);
    frameW = origin.frameW - shift;
    panX = origin.panX - shift;
  }
  if (handle.dy === 1) {
    frameH = clamp(origin.frameH + dy, MIN_FRAME_PX, imgH(origin) + origin.panY);
  } else if (handle.dy === -1) {
    const shift = clamp(dy, origin.panY, origin.frameH - MIN_FRAME_PX);
    frameH = origin.frameH - shift;
    panY = origin.panY - shift;
  }
  return clampCropWindow({ ...origin, frameW, frameH, panX, panY });
}

/** Normal-mode corner drag: scales picture, frame and pan together (aspect kept). */
export function scaleImageBox(origin: CropBox, handle: HandleDir, dx: number): CropBox {
  const direction = handle.dx === 0 ? 1 : handle.dx;
  const scale = clamp((origin.frameW + dx * direction) / origin.frameW, MIN_FRAME_PX / origin.frameW, 8);
  return {
    ...origin,
    imgW: origin.imgW * scale,
    frameW: origin.frameW * scale,
    frameH: origin.frameH * scale,
    panX: origin.panX * scale,
    panY: origin.panY * scale,
  };
}

/** Undoes any crop: the frame becomes the whole picture. */
export function resetCrop(box: CropBox): CropBox {
  return { ...box, frameW: box.imgW, frameH: imgH(box), panX: 0, panY: 0 };
}
