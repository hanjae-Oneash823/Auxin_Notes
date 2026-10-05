import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { type EditorState, RangeSetBuilder, StateField, type TransactionSpec } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { openTableMenu } from './tableMenu';
import {
  type ColumnAlign,
  type Grid,
  deleteColumn,
  deleteRow,
  escapeCell,
  insertColumn,
  insertRow,
  serializeGrid,
  setAlign,
  setCell,
} from './tableOps';

/** One editable cell: its text plus the doc range that text occupies
 *  (`from === to` for an empty cell, `-1` for a ragged-row placeholder). */
interface Cell {
  text: string;
  from: number;
  to: number;
}

interface TableData {
  index: number; // nth table in the doc — keys the per-session column widths
  from: number;
  to: number;
  header: Cell[];
  rows: Cell[][];
  align: (ColumnAlign | null)[];
}

interface CellFocus {
  r: number; // 0 = header, 1.. = body rows
  c: number;
}

/** Where focus goes after an edit: a cell, or out of the table to the line
 *  before/after it. */
type Target = CellFocus | 'before' | 'after';

const MIN_COLUMN_WIDTH = 48;

/** Set by an edit that rebuilds the widget, consumed by the next `toDOM` for
 *  that table — the rebuild replaces the DOM, so focus has to be re-applied. */
let pendingFocus: (CellFocus & { from: number }) | null = null;

/** Dragged column widths. Markdown has nowhere to store them, so they live
 *  for the editor session only (keyed by table order, not position, so edits
 *  above a table don't lose them). */
const columnWidths = new WeakMap<EditorView, Map<number, number[]>>();

const ALIGN_ICON: Record<ColumnAlign, string> = {
  left: '<path d="M2 3h10M2 7h6M2 11h8"/>',
  center: '<path d="M2 3h10M4 7h6M3 11h8"/>',
  right: '<path d="M2 3h10M6 7h6M4 11h8"/>',
};
const NEXT_ALIGN: Record<ColumnAlign, ColumnAlign> = { center: 'right', right: 'left', left: 'center' };

function alignIcon(align: ColumnAlign): string {
  return `<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">${ALIGN_ICON[align]}</svg>`;
}

/** The cell text is un-escaped for display (`\|`/`\\` only — see
 *  @lezer/markdown's `parseRow`). Inline formatting (bold, links) is
 *  deliberately not rendered inside a cell — cells show as plain text. */
function cellText(state: EditorState, from: number, to: number): string {
  return state.doc.sliceString(from, to).replace(/\\([|\\])/g, '$1');
}

/** `parseRow` emits no `TableCell` for an empty cell (`||` or `|  |`), so
 *  cells are rebuilt from the delimiters: a delimiter that closes a slot
 *  nothing filled is an empty cell, editable at a point inside that gap. */
function readRow(state: EditorState, row: SyntaxNode): Cell[] {
  const cells: Cell[] = [];
  let slotStart = row.from;
  let filled = false;
  for (let child = row.firstChild, index = 0; child; child = child.nextSibling, index++) {
    if (child.name === 'TableCell') {
      cells.push({ text: cellText(state, child.from, child.to), from: child.from, to: child.to });
      filled = true;
    } else if (child.name === 'TableDelimiter') {
      if (index === 0) {
        slotStart = child.to; // leading pipe — opens the first slot
        continue;
      }
      if (!filled) {
        const at = Math.min(slotStart + 1, child.from);
        cells.push({ text: '', from: at, to: at });
      }
      slotStart = child.to;
      filled = false;
    }
  }
  return cells;
}

/** The alignment row (`| --- | :--- | ---: |`) is its own `TableDelimiter`
 *  child of `Table` (distinct from the per-`|` `TableDelimiter` nodes inside
 *  each row) — see @lezer/markdown's `TableParser.nextLine`, which pushes it
 *  as the second element right after `TableHeader`. */
function parseAlignmentRow(text: string): (ColumnAlign | null)[] {
  return text
    .split('|')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const left = segment.startsWith(':');
      const right = segment.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return null;
    });
}

function readTable(state: EditorState, table: SyntaxNode, index: number): TableData | null {
  let header: Cell[] | null = null;
  let align: (ColumnAlign | null)[] = [];
  const rows: Cell[][] = [];

  for (let child = table.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableHeader') header = readRow(state, child);
    else if (child.name === 'TableRow') rows.push(readRow(state, child));
    else if (child.name === 'TableDelimiter' && header !== null) {
      align = parseAlignmentRow(state.doc.sliceString(child.from, child.to));
    }
  }
  if (!header) return null;

  // Ragged rows: pad to the header width so every row renders the same grid;
  // the padding is read-only (no doc range to write to).
  const pad = (cells: Cell[]) =>
    cells.length >= header.length
      ? cells
      : [...cells, ...Array.from({ length: header.length - cells.length }, () => ({ text: '', from: -1, to: -1 }))];
  return { index, from: table.from, to: table.to, header, rows: rows.map(pad), align };
}

function toGrid(data: TableData): Grid {
  return {
    cells: [data.header, ...data.rows].map((row) => row.map((cell) => cell.text)),
    align: data.header.map((_, i) => data.align[i] ?? null),
  };
}

function focusCell(root: ParentNode, { r, c }: CellFocus) {
  const el = root.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`);
  if (!el) return;
  el.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Collapsed caret at the very start / end of a cell's text. */
function caretEdge(el: HTMLElement): 'start' | 'end' | 'both' | null {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || !el.contains(selection.anchorNode)) return null;
  const offset = selection.anchorOffset;
  const isStart = offset === 0;
  const isEnd = selection.anchorNode === el ? offset >= el.childNodes.length : offset === (el.textContent?.length ?? 0);
  if (isStart && isEnd) return 'both';
  return isStart ? 'start' : isEnd ? 'end' : null;
}

class TableWidget extends WidgetType {
  private readonly cells = new WeakMap<HTMLElement, Cell>();
  /** Set once an edit has been dispatched: this DOM is about to be replaced,
   *  and a late blur from its removal must not re-apply stale doc ranges. */
  private isStale = false;

  constructor(
    private readonly data: TableData,
    private readonly readOnly: boolean,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return JSON.stringify(other.data) === JSON.stringify(this.data);
  }

  /** The one write path. With no `mutate`, only the focused cell's pending
   *  text is written (a minimal edit at its range). With `mutate`, the grid —
   *  including that pending text — is transformed and the whole table is
   *  re-serialized (which also re-pads the raw pipes). */
  private run(view: EditorView, outer: HTMLElement, mutate?: (grid: Grid) => Grid, target?: Target) {
    if (this.isStale) return;
    const active = outer.querySelector<HTMLElement>('[data-r]:focus');
    const cell = active ? this.cells.get(active) : undefined;
    const typed = (active?.textContent ?? '').replace(/\s*\n\s*/g, ' ').trim();
    const isEdited = !!active && !!cell && typed !== cell.text;

    let change: { from: number; to: number; insert: string } | null = null;
    if (mutate) {
      const base = toGrid(this.data);
      const grid = isEdited ? setCell(base, Number(active.dataset.r), Number(active.dataset.c), typed) : base;
      change = { from: this.data.from, to: this.data.to, insert: serializeGrid(mutate(grid)) };
    } else if (isEdited && cell) {
      change = { from: cell.from, to: cell.to, insert: escapeCell(typed) };
    }

    if (!change) {
      if (typeof target === 'object') focusCell(outer, target);
      else if (target) this.exitTable(view, target, 0);
      return;
    }

    this.isStale = true;
    pendingFocus = typeof target === 'object' ? { ...target, from: this.data.from } : null;
    view.dispatch({ changes: change });
    if (typeof target === 'string') this.exitTable(view, target, change.insert.length - (change.to - change.from));
    else if (typeof target === 'object') view.focus();
  }

  /** Put the editor caret on the line before/after the table (shifted by
   *  `delta` if an edit just changed the table's length). */
  private exitTable(view: EditorView, side: 'before' | 'after', delta: number) {
    const anchor = side === 'before' ? this.data.from - 1 : this.data.to + delta + 1;
    if (anchor < 0 || anchor > view.state.doc.length) return;
    const spec: TransactionSpec = { selection: { anchor }, scrollIntoView: true };
    view.dispatch(spec);
    view.focus();
  }

  private deleteTable(view: EditorView) {
    this.isStale = true;
    const to = Math.min(this.data.to + 1, view.state.doc.length); // swallow the trailing newline too
    view.dispatch({ changes: { from: this.data.from, to } });
    view.focus();
  }

  private onKeyDown(view: EditorView, outer: HTMLElement, el: HTMLElement, cell: Cell, r: number, c: number, event: KeyboardEvent) {
    const cols = this.data.header.length;
    const lastRow = this.data.rows.length;
    const index = r * cols + c;
    const inOrder = (i: number): Target | undefined =>
      i < 0 ? undefined : i >= (lastRow + 1) * cols ? undefined : { r: Math.floor(i / cols), c: i % cols };
    const go = (target: Target | undefined) => {
      event.preventDefault();
      if (target) this.run(view, outer, undefined, target);
    };

    switch (event.key) {
      case 'Escape':
        el.textContent = cell.text;
        el.blur();
        break;
      case 'Enter':
        go(r < lastRow ? { r: r + 1, c } : undefined);
        if (r >= lastRow) this.run(view, outer);
        break;
      case 'ArrowUp':
        go(r > 0 ? { r: r - 1, c } : 'before');
        break;
      case 'ArrowDown':
        go(r < lastRow ? { r: r + 1, c } : 'after');
        break;
      case 'ArrowLeft':
        if (!event.shiftKey && ['start', 'both'].includes(caretEdge(el) ?? '')) go(inOrder(index - 1));
        break;
      case 'ArrowRight':
        if (!event.shiftKey && ['end', 'both'].includes(caretEdge(el) ?? '')) go(inOrder(index + 1));
        break;
      case 'Tab': {
        const next = inOrder(index + (event.shiftKey ? -1 : 1));
        if (next || event.shiftKey) {
          go(next);
        } else {
          event.preventDefault();
          this.run(view, outer, (grid) => insertRow(grid, lastRow + 1), { r: lastRow + 1, c: 0 });
        }
        break;
      }
    }
  }

  private openContextMenu(view: EditorView, outer: HTMLElement, event: MouseEvent, r: number, c: number) {
    event.preventDefault();
    const cols = this.data.header.length;
    const act = (mutate: (grid: Grid) => Grid, target: CellFocus) => () => this.run(view, outer, mutate, target);
    openTableMenu(event.clientX, event.clientY, [
      ...(r > 0 ? [{ label: 'Insert row above', onSelect: act((g) => insertRow(g, r), { r, c }) }] : []),
      { label: 'Insert row below', onSelect: act((g) => insertRow(g, r + 1), { r: r + 1, c }) },
      { label: 'Insert column left', onSelect: act((g) => insertColumn(g, c), { r, c }) },
      { label: 'Insert column right', onSelect: act((g) => insertColumn(g, c + 1), { r, c: c + 1 }) },
      ...(r > 0
        ? [{ label: 'Delete row', isDanger: true, onSelect: act((g) => deleteRow(g, r), { r: Math.min(r, this.data.rows.length - 1), c }) }]
        : []),
      ...(cols > 1
        ? [{ label: 'Delete column', isDanger: true, onSelect: act((g) => deleteColumn(g, c), { r, c: Math.min(c, cols - 2) }) }]
        : []),
      { label: 'Delete table', isDanger: true, onSelect: () => this.deleteTable(view) },
    ]);
  }

  private buildCell(view: EditorView, outer: HTMLElement, tag: 'th' | 'td', cell: Cell, r: number, c: number) {
    const td = document.createElement(tag);
    td.style.textAlign = this.data.align[c] ?? 'left';
    const el = document.createElement('div');
    el.className = 'cm-md-table-cell';
    el.textContent = cell.text;
    td.appendChild(el);
    if (this.readOnly) return td;

    td.addEventListener('contextmenu', (event) => this.openContextMenu(view, outer, event, r, c));
    if (cell.from < 0) return td;

    el.setAttribute('contenteditable', 'plaintext-only');
    el.spellcheck = false;
    el.dataset.r = String(r);
    el.dataset.c = String(c);
    this.cells.set(el, cell);
    el.addEventListener('keydown', (event) => this.onKeyDown(view, outer, el, cell, r, c, event));
    el.addEventListener('blur', () => this.run(view, outer));

    if (r === 0) {
      td.appendChild(this.buildAlignButton(view, outer, c));
      td.appendChild(this.buildResizer(view, outer, c));
    }
    return td;
  }

  private buildAlignButton(view: EditorView, outer: HTMLElement, column: number) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-md-table-align';
    button.title = 'Cycle column alignment';
    button.innerHTML = alignIcon(this.data.align[column] ?? 'left');
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const next = NEXT_ALIGN[this.data.align[column] ?? 'left'];
      this.run(view, outer, (grid) => setAlign(grid, column, next));
    });
    return button;
  }

  private buildResizer(view: EditorView, outer: HTMLElement, column: number) {
    const handle = document.createElement('div');
    handle.className = 'cm-md-table-resizer';
    handle.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const table = outer.querySelector<HTMLTableElement>('table');
      if (!table) return;
      const cols = Array.from(table.querySelectorAll<HTMLElement>('col'));
      const widths = Array.from(table.querySelectorAll('th'), (th) => th.getBoundingClientRect().width);
      const startX = event.clientX;
      const startWidth = widths[column];
      const apply = () => {
        cols.forEach((col, i) => (col.style.width = `${widths[i]}px`));
        table.style.width = `${widths.reduce((sum, w) => sum + w, 0)}px`;
        table.style.tableLayout = 'fixed';
      };
      const onMove = (move: MouseEvent) => {
        widths[column] = Math.max(MIN_COLUMN_WIDTH, startWidth + move.clientX - startX);
        apply();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const store = columnWidths.get(view) ?? new Map<number, number[]>();
        columnWidths.set(view, store.set(this.data.index, widths));
      };
      apply();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    return handle;
  }

  private buildAddButton(className: string, label: string, onClick: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = label;
    button.textContent = '+';
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', onClick);
    return button;
  }

  toDOM(view: EditorView) {
    const outer = document.createElement('div');
    outer.className = 'cm-md-table-outer';

    const scroll = document.createElement('div');
    scroll.className = 'cm-md-table-scroll';
    const table = document.createElement('table');
    table.className = 'cm-md-table';

    const widths = columnWidths.get(view)?.get(this.data.index);
    const colgroup = document.createElement('colgroup');
    this.data.header.forEach((_, c) => {
      const col = document.createElement('col');
      if (widths?.[c]) col.style.width = `${widths[c]}px`;
      colgroup.appendChild(col);
    });
    table.appendChild(colgroup);
    if (widths) {
      table.style.tableLayout = 'fixed';
      table.style.width = `${widths.reduce((sum, w) => sum + w, 0)}px`;
    }

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    this.data.header.forEach((cell, c) => headRow.appendChild(this.buildCell(view, outer, 'th', cell, 0, c)));
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    this.data.rows.forEach((row, i) => {
      const tr = document.createElement('tr');
      row.forEach((cell, c) => tr.appendChild(this.buildCell(view, outer, 'td', cell, i + 1, c)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    scroll.appendChild(table);
    outer.appendChild(scroll);

    if (!this.readOnly) {
      const lastRow = this.data.rows.length;
      const cols = this.data.header.length;
      outer.appendChild(
        this.buildAddButton('cm-md-table-add-col', 'Add column', () =>
          this.run(view, outer, (grid) => insertColumn(grid, cols), { r: 0, c: cols }),
        ),
      );
      outer.appendChild(
        this.buildAddButton('cm-md-table-add-row', 'Add row', () =>
          this.run(view, outer, (grid) => insertRow(grid, lastRow + 1), { r: lastRow + 1, c: 0 }),
        ),
      );
    }

    if (pendingFocus?.from === this.data.from) {
      const focus = pendingFocus;
      pendingFocus = null;
      requestAnimationFrame(() => focusCell(outer, focus));
    }
    return outer;
  }

  ignoreEvent() {
    return true; // cells handle their own input; CodeMirror stays out of the widget
  }
}

/**
 * Renders GFM `| a | b |` tables (parsed via @lezer/markdown's `Table`
 * extension, enabled in markdownSetup.ts) as a real HTML `<table>`, same
 * live-preview hide/reveal rule as mathPlugin.ts: raw pipe source shows only
 * while the cursor/selection overlaps the table (or always, in read-only
 * mode), same hide/reveal rule as hideSyntaxPlugin.ts's bold/italic/code
 * handling.
 *
 * The rendered cells are editable in place (plain text, Tab/Enter to move,
 * Tab past the last cell appends a row); every edit is written back to the
 * markdown source, which stays the single source of truth.
 *
 * A `StateField`, not a `ViewPlugin` — CM6 requires block decorations
 * (`Decoration.replace({ block: true })`, needed here since a table spans
 * multiple lines) to come from a `StateField`; a plugin-provided one throws
 * `RangeError: Block decorations may not be specified via plugins` at
 * runtime. This also means no `view.composing` guard like the other widget
 * plugins here (a `StateField` only sees `Transaction`s, not the view) —
 * unneeded anyway, since a table under active edit is never widget-rendered
 * in the first place (see `cursorInTable` below), so there's nothing at the
 * composition caret for a rebuild to disturb.
 */
export function createTablePlugin(readOnly: boolean) {
  return StateField.define<DecorationSet>({
    create(state) {
      return build(state, readOnly);
    },
    update(decorations, tr) {
      if (!tr.docChanged && !tr.selection) return decorations.map(tr.changes);
      return build(tr.state, readOnly);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

function build(state: EditorState, readOnly: boolean): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const selection = state.selection.main;
  let index = 0;

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'Table') return;
      const tableIndex = index++;
      const cursorInTable = !readOnly && selection.from <= node.to && selection.to >= node.from;
      if (cursorInTable) return false;
      const data = readTable(state, node.node, tableIndex);
      if (!data) return false;
      builder.add(node.from, node.to, Decoration.replace({ widget: new TableWidget(data, readOnly), block: true }));
      return false; // no need to descend into TableHeader/TableRow/TableCell — already read above
    },
  });

  return builder.finish();
}
