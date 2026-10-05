export interface TableMenuItem {
  label: string;
  onSelect: () => void;
  isDanger?: boolean;
}

let openMenu: { el: HTMLElement; dispose: () => void } | null = null;

export function closeTableMenu() {
  openMenu?.dispose();
  openMenu = null;
}

/** A small floating context menu. Rows swallow `mousedown` so the table cell
 *  that was being edited keeps focus (and its pending text) until the action
 *  runs. Styled inline, like slashCommandPlugin's menu, because it lives on
 *  `document.body` outside the editor's scoped theme. */
export function openTableMenu(x: number, y: number, items: readonly TableMenuItem[]) {
  closeTableMenu();

  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    left: `${x}px`,
    top: `${y}px`,
    zIndex: '70',
    minWidth: '170px',
    padding: '4px',
    background: 'var(--color-bg)',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    fontFamily: 'var(--font-family)',
    fontSize: '0.85rem',
  });

  for (const item of items) {
    const row = document.createElement('div');
    row.textContent = item.label;
    Object.assign(row.style, {
      padding: '5px 10px',
      borderRadius: '5px',
      cursor: 'pointer',
      color: item.isDanger ? 'var(--accent-trash)' : 'var(--color-fg)',
    });
    row.addEventListener('mouseenter', () => {
      row.style.background = 'color-mix(in srgb, var(--color-fg) 10%, transparent)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
    });
    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => {
      closeTableMenu();
      item.onSelect();
    });
    el.appendChild(row);
  }
  document.body.appendChild(el);

  const rect = el.getBoundingClientRect();
  el.style.left = `${Math.max(4, Math.min(x, window.innerWidth - rect.width - 4))}px`;
  el.style.top = `${Math.max(4, Math.min(y, window.innerHeight - rect.height - 4))}px`;

  const onPointerDown = (event: MouseEvent) => {
    if (!el.contains(event.target as Node)) closeTableMenu();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeTableMenu();
  };
  document.addEventListener('mousedown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', closeTableMenu);
  openMenu = {
    el,
    dispose: () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', closeTableMenu);
      el.remove();
    },
  };
}
