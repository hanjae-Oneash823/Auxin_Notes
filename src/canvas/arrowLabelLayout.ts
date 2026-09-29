import {
  ARROW_LABEL_FONT_PX,
  ARROW_LABEL_LINE_HEIGHT_PX,
  ARROW_LABEL_MAX_LINES,
  ARROW_LABEL_MAX_WIDTH,
} from './canvasConstants';

export interface ArrowLabelLayout {
  lines: string[];
  /** Widest line, at most `ARROW_LABEL_MAX_WIDTH`. */
  width: number;
  height: number;
}

const ELLIPSIS = '…';
/** Average glyph width as a fraction of font size — only for when no canvas exists to measure with. */
const FALLBACK_CHAR_WIDTH_EM = 0.55;

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Pixel width of `text` at the label font, measured with a canvas 2D context. */
function measureWidth(text: string): number {
  if (measureContext === undefined) {
    measureContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (measureContext) {
      const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
      measureContext.font = `${ARROW_LABEL_FONT_PX}px ${family}`;
    }
  }
  return measureContext ? measureContext.measureText(text).width : text.length * ARROW_LABEL_FONT_PX * FALLBACK_CHAR_WIDTH_EM;
}

/** The longest prefix of `word` that fits in `maxWidth` (at least one character). */
function fittingPrefix(word: string, maxWidth: number, measure: (text: string) => number): string {
  let end = 1;
  while (end < word.length && measure(word.slice(0, end + 1)) <= maxWidth) end += 1;
  return word.slice(0, end);
}

/**
 * Word-wraps an arrow label to `ARROW_LABEL_MAX_WIDTH`, breaking a single
 * over-long word mid-word and capping the result at `ARROW_LABEL_MAX_LINES`
 * (the last line then ends in "…"). Used to draw the label and to size the box
 * the layout keeps clear. `measure` is injectable for tests.
 */
export function layoutArrowLabel(label: string, measure: (text: string) => number = measureWidth): ArrowLabelLayout {
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    if (line) lines.push(line);
    line = '';
  };

  for (const word of label.split(/\s+/).filter(Boolean)) {
    let rest = word;
    while (measure(rest) > ARROW_LABEL_MAX_WIDTH) {
      flush();
      const piece = fittingPrefix(rest, ARROW_LABEL_MAX_WIDTH, measure);
      lines.push(piece);
      rest = rest.slice(piece.length);
    }
    const candidate = line ? `${line} ${rest}` : rest;
    if (measure(candidate) <= ARROW_LABEL_MAX_WIDTH) line = candidate;
    else {
      flush();
      line = rest;
    }
  }
  flush();

  const capped = lines.slice(0, ARROW_LABEL_MAX_LINES);
  if (lines.length > ARROW_LABEL_MAX_LINES) {
    let last = capped[capped.length - 1];
    while (last.length > 1 && measure(last + ELLIPSIS) > ARROW_LABEL_MAX_WIDTH) last = last.slice(0, -1);
    capped[capped.length - 1] = last + ELLIPSIS;
  }
  const width = Math.min(ARROW_LABEL_MAX_WIDTH, Math.max(0, ...capped.map(measure)));
  return { lines: capped, width, height: capped.length * ARROW_LABEL_LINE_HEIGHT_PX };
}
