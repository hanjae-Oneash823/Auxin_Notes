import { Prec } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin, type ViewUpdate } from '@codemirror/view';

interface SlashCommand {
  label: string;
  snippet: string;
  cursorOffset: number;
}

const COMMANDS: SlashCommand[] = [
  { label: 'Heading 1', snippet: '# ', cursorOffset: 2 },
  { label: 'Heading 2', snippet: '## ', cursorOffset: 3 },
  { label: 'Heading 3', snippet: '### ', cursorOffset: 4 },
  { label: 'Bullet list', snippet: '- ', cursorOffset: 2 },
  { label: 'Numbered list', snippet: '1. ', cursorOffset: 3 },
  { label: 'Quote', snippet: '> ', cursorOffset: 2 },
  { label: 'Code block', snippet: '```\n\n```', cursorOffset: 4 },
  { label: 'Divider', snippet: '---\n', cursorOffset: 4 },
  { label: 'Image', snippet: '![]()', cursorOffset: 2 },
  { label: 'Wikilink', snippet: '[[]]', cursorOffset: 2 },
];

const SLASH_TRIGGER = /^\/(\w*)$/;

class SlashMenu {
  private readonly el: HTMLDivElement;
  private view: EditorView;
  private items: SlashCommand[] = [];
  private selectedIndex = 0;

  constructor(view: EditorView) {
    this.view = view;
    this.el = document.createElement('div');
    this.el.style.position = 'fixed';
    this.el.style.display = 'none';
    this.el.style.background = 'var(--color-bg)';
    this.el.style.border = '1px solid var(--border-default)';
    this.el.style.zIndex = '60';
    this.el.style.minWidth = '180px';
    this.el.style.fontFamily = 'var(--font-family)';
    this.el.style.fontSize = '0.85rem';
    document.body.appendChild(this.el);
  }

  destroy() {
    this.el.remove();
  }

  isOpen() {
    return this.items.length > 0;
  }

  close() {
    this.items = [];
    this.el.style.display = 'none';
  }

  update(update: ViewUpdate) {
    this.view = update.view;
    const pos = this.view.state.selection.main.head;
    const line = this.view.state.doc.lineAt(pos);
    const match = line.text.slice(0, pos - line.from).match(SLASH_TRIGGER);

    if (!match) {
      this.close();
      return;
    }

    const query = match[1].toLowerCase();
    this.items = COMMANDS.filter((cmd) => cmd.label.toLowerCase().includes(query));
    this.selectedIndex = 0;
    this.render(pos);
  }

  private render(pos: number) {
    if (this.items.length === 0) {
      this.close();
      return;
    }
    const coords = this.view.coordsAtPos(pos);
    if (!coords) {
      this.close();
      return;
    }

    this.el.style.left = `${coords.left}px`;
    this.el.style.top = `${coords.bottom + 4}px`;
    this.el.style.display = 'block';
    this.el.innerHTML = '';

    this.items.forEach((item, index) => {
      const row = document.createElement('div');
      row.textContent = item.label;
      row.style.padding = '4px 8px';
      row.style.cursor = 'pointer';
      const active = index === this.selectedIndex;
      row.style.color = active ? 'var(--color-bg)' : 'var(--color-fg)';
      row.style.background = active ? 'var(--color-fg)' : 'transparent';
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this.apply(item);
      });
      this.el.appendChild(row);
    });
  }

  moveSelection(delta: number) {
    if (this.items.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.items.length) % this.items.length;
    this.render(this.view.state.selection.main.head);
  }

  applySelected() {
    const item = this.items[this.selectedIndex];
    if (item) this.apply(item);
  }

  private apply(item: SlashCommand) {
    const pos = this.view.state.selection.main.head;
    const line = this.view.state.doc.lineAt(pos);
    this.view.dispatch({
      changes: { from: line.from, to: pos, insert: item.snippet },
      selection: { anchor: line.from + item.cursorOffset },
    });
    this.close();
    this.view.focus();
  }
}

const slashMenuPlugin = ViewPlugin.fromClass(
  class {
    menu: SlashMenu;
    constructor(view: EditorView) {
      this.menu = new SlashMenu(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.menu.update(update);
      }
    }
    destroy() {
      this.menu.destroy();
    }
  },
);

function withOpenMenu(view: EditorView, fn: (menu: SlashMenu) => void): boolean {
  const instance = view.plugin(slashMenuPlugin);
  if (!instance || !instance.menu.isOpen()) return false;
  fn(instance.menu);
  return true;
}

/**
 * `/` at the start of a line opens a keyboard-navigable insert menu (heading,
 * list, code block, image, wikilink, divider, quote) — Notion's *mechanism*,
 * none of its block-database data model. Thin and dumb by design: no
 * AI-suggested blocks, just a fast snippet-insert list.
 */
export function createSlashCommandPlugin() {
  return [
    slashMenuPlugin,
    Prec.highest(
      keymap.of([
        { key: 'ArrowDown', run: (view) => withOpenMenu(view, (menu) => menu.moveSelection(1)) },
        { key: 'ArrowUp', run: (view) => withOpenMenu(view, (menu) => menu.moveSelection(-1)) },
        { key: 'Enter', run: (view) => withOpenMenu(view, (menu) => menu.applySelected()) },
        { key: 'Escape', run: (view) => withOpenMenu(view, (menu) => menu.close()) },
      ]),
    ),
  ];
}
