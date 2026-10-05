export type ColumnAlign = 'left' | 'center' | 'right';

/** A table as plain strings: `cells[0]` is the header, `align` has one entry
 *  per column. Every op returns a new grid — the widget serializes the result
 *  back over the whole table in the markdown source. */
export interface Grid {
  cells: readonly (readonly string[])[];
  align: readonly (ColumnAlign | null)[];
}

const MIN_COLUMN_DASHES = 3;

/** Escape what the cell parser would otherwise read as structure: a literal
 *  pipe, or a backslash that would swallow the next pipe/backslash. */
export function escapeCell(text: string): string {
  return text.replace(/\\(?=[\\|]|$)|\|/g, (match) => `\\${match}`);
}

export function setCell(grid: Grid, r: number, c: number, text: string): Grid {
  return { ...grid, cells: grid.cells.map((row, i) => (i === r ? row.map((v, j) => (j === c ? text : v)) : row)) };
}

export function insertRow(grid: Grid, at: number): Grid {
  const blank = grid.align.map(() => '');
  return { ...grid, cells: [...grid.cells.slice(0, at), blank, ...grid.cells.slice(at)] };
}

export function deleteRow(grid: Grid, at: number): Grid {
  return { ...grid, cells: grid.cells.filter((_, i) => i !== at) };
}

export function insertColumn(grid: Grid, at: number): Grid {
  const splice = <T>(row: readonly T[], value: T) => [...row.slice(0, at), value, ...row.slice(at)];
  return { cells: grid.cells.map((row) => splice(row, '')), align: splice(grid.align, null) };
}

export function deleteColumn(grid: Grid, at: number): Grid {
  const drop = <T>(row: readonly T[]) => row.filter((_, i) => i !== at);
  return { cells: grid.cells.map(drop), align: drop(grid.align) };
}

export function setAlign(grid: Grid, c: number, align: ColumnAlign | null): Grid {
  return { ...grid, align: grid.align.map((a, i) => (i === c ? align : a)) };
}

function delimiterSegment(align: ColumnAlign | null, width: number): string {
  if (align === 'center') return `:${'-'.repeat(width - 2)}:`;
  if (align === 'right') return `${'-'.repeat(width - 1)}:`;
  if (align === 'left') return `:${'-'.repeat(width - 1)}`;
  return '-'.repeat(width);
}

/** Pretty-printed GFM source: columns padded so the raw pipes line up. */
export function serializeGrid(grid: Grid): string {
  const escaped = grid.cells.map((row) => row.map(escapeCell));
  const widths = grid.align.map((_, c) =>
    Math.max(MIN_COLUMN_DASHES, ...escaped.map((row) => row[c]?.length ?? 0)),
  );
  const line = (row: readonly string[]) => `| ${widths.map((w, c) => (row[c] ?? '').padEnd(w)).join(' | ')} |`;
  const delimiter = `| ${widths.map((w, c) => delimiterSegment(grid.align[c], w)).join(' | ')} |`;
  const [header, ...body] = escaped;
  return [line(header), delimiter, ...body.map(line)].join('\n');
}
