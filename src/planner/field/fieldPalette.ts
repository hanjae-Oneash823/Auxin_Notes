/** Colors the field canvas needs, resolved from Auxin's CSS variables (a canvas can't read `var()`). */
export interface FieldPalette {
  background: string;
  text: string;
  muted: string;
  faint: string;
  fontFamily: string;
}

/** Resolves any CSS color expression (a var(), a hex) to the browser's "rgb(...)" / "rgba(...)" form. */
function resolveColor(expression: string): string {
  const probe = document.createElement('span');
  probe.style.color = expression;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

export function readFieldPalette(): FieldPalette {
  return {
    background: resolveColor('var(--color-bg)'),
    text: resolveColor('var(--fg-prominent)'),
    muted: resolveColor('var(--fg-muted)'),
    faint: resolveColor('var(--fg-faint)'),
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-family').trim() || 'sans-serif',
  };
}

const CHANNELS = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/;

/** The color with its alpha replaced (a "rgb(...)" / "rgba(...)" string in, a "rgba(...)" string out). */
export function withAlpha(color: string, alpha: number): string {
  const match = CHANNELS.exec(color);
  return match ? `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})` : color;
}
