// Runnable check for image crop geometry: `node --experimental-strip-types src/document/cropMath.check.ts`
import { clampCropWindow, resetCrop, resizeCropWindow, scaleImageBox } from './cropMath.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`cropMath check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

// 400×300 picture (ratio 0.75), uncropped.
const full = { imgW: 400, ratio: 0.75, frameW: 400, frameH: 300, panX: 0, panY: 0 };

// Panning an uncropped image goes nowhere; a cropped one pans only within the picture.
equal(clampCropWindow({ ...full, panX: -50, panY: 20 }), { ...full, panX: 0, panY: 0 }, 'uncropped image cannot pan');
const cropped = { ...full, frameW: 200, frameH: 150 };
equal(clampCropWindow({ ...cropped, panX: -500, panY: 30 }), { ...cropped, panX: -200, panY: 0 }, 'pan clamps to cover the frame');

// Right/bottom edge drags shrink the frame, panning stays put.
equal(resizeCropWindow(full, { dx: 1, dy: 0 }, -100, 0), { ...full, frameW: 300 }, 'right edge shrinks width');
equal(resizeCropWindow(full, { dx: 1, dy: 1 }, 999, 999), full, 'cannot grow past the picture');

// Left edge drag crops from the left: frame narrows and the picture keeps its place on the page.
equal(resizeCropWindow(full, { dx: -1, dy: 0 }, 100, 0), { ...full, frameW: 300, panX: -100 }, 'left edge crops from the left');
equal(resizeCropWindow(full, { dx: -1, dy: 0 }, -50, 0), full, 'left edge cannot grow past the picture');

// Frame never collapses below the minimum.
equal(resizeCropWindow(full, { dx: 1, dy: 0 }, -9999, 0).frameW, 24, 'minimum frame width');

// Corner scaling keeps aspect and scales pan with the picture.
equal(scaleImageBox(cropped, { dx: 1, dy: 1 }, 200), { ...full, imgW: 800, frameW: 400, frameH: 300 }, 'corner drag doubles everything');

// Reset restores the whole picture.
equal(resetCrop({ ...cropped, panX: -80, panY: -30 }), full, 'reset shows the whole picture');

console.log('cropMath check passed');
