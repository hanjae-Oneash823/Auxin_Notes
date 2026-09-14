import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { type EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

type ColumnAlign = 'left' | 'center' | 'right';

interface TableData {
  from: number;
  to: number;
  header: string[];
  rows: string[][];
  align: (ColumnAlign | null)[];
}

/** A cell's `TableCell` node span already excludes its surrounding pipes and
 *  whitespace (see @lezer/markdown's `parseRow`) — the only cleanup left is
 *  un-escaping a literal `\|`/`\\`, which that parser tracks for splitting
 *  purposes but leaves in the raw text. Inline formatting (bold, links) is
 *  deliberately not rendered inside a cell — out of scope for a first pass,
 *  cells show as plain text. */
function cellText(state: EditorState, cell: SyntaxNode): string {
  return state.doc.sliceString(cell.from, cell.to).replace(/\\([|\\])/g, '$1');
}

function readRow(state: EditorState, row: SyntaxNode): string[] {
  const cells: string[] = [];
  for (let cell = row.firstChild; cell; cell = cell.nextSibling) {
    if (cell.name === 'TableCell') cells.push(cellText(state, cell));
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

function readTable(state: EditorState, table: SyntaxNode): TableData | null {
  let header: string[] | null = null;
  let align: (ColumnAlign | null)[] = [];
  const rows: string[][] = [];

  for (let child = table.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableHeader') header = readRow(state, child);
    else if (child.name === 'TableRow') rows.push(readRow(state, child));
    else if (child.name === 'TableDelimiter' && header !== null) {
      align = parseAlignmentRow(state.doc.sliceString(child.from, child.to));
    }
  }

  return header ? { from: table.from, to: table.to, header, rows, align } : null;
}

class TableWidget extends WidgetType {
  constructor(private readonly data: TableData) {
    super();
  }

  eq(other: TableWidget) {
    return (
      other.data.from === this.data.from &&
      other.data.to === this.data.to &&
      JSON.stringify(other.data.header) === JSON.stringify(this.data.header) &&
      JSON.stringify(other.data.rows) === JSON.stringify(this.data.rows) &&
      JSON.stringify(other.data.align) === JSON.stringify(this.data.align)
    );
  }

  private buildRow(tag: 'th' | 'td', cells: string[]): HTMLTableRowElement {
    const tr = document.createElement('tr');
    cells.forEach((text, index) => {
      const cell = document.createElement(tag);
      cell.textContent = text;
      cell.style.textAlign = this.data.align[index] ?? 'left';
      tr.appendChild(cell);
    });
    return tr;
  }

  toDOM() {
    const outer = document.createElement('div');
    outer.className = 'cm-md-table-outer';

    const table = document.createElement('table');
    table.className = 'cm-md-table';

    const thead = document.createElement('thead');
    thead.appendChild(this.buildRow('th', this.data.header));
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of this.data.rows) tbody.appendChild(this.buildRow('td', row));
    table.appendChild(tbody);

    outer.appendChild(table);
    return outer;
  }

  ignoreEvent() {
    return true; // let clicks fall through to CodeMirror so they still place the cursor
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

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'Table') return;
      const cursorInTable = !readOnly && selection.from <= node.to && selection.to >= node.from;
      if (cursorInTable) return false;
      const data = readTable(state, node.node);
      if (!data) return false;
      builder.add(node.from, node.to, Decoration.replace({ widget: new TableWidget(data), block: true }));
      return false; // no need to descend into TableHeader/TableRow/TableCell — already read above
    },
  });

  return builder.finish();
}
