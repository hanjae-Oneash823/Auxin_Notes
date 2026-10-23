import { useState } from 'react';
import { PopupPicker } from './PopupPicker';
import { FIELD_CLASS } from './plannerStyles';

/** Ordered by hue around the color wheel, with the neutral grey last. */
export const ARC_PALETTE = [
  '#f87171', '#fb923c', '#f59e0b', '#facc15', '#a3e635', '#34d399', '#00c4a7',
  '#22d3ee', '#38bdf8', '#60a5fa', '#6366f1', '#a78bfa', '#e879f9', '#f472b6', '#94a3b8',
] as const;
const DEFAULT_ARC_COLOR = '#00c4a7';

export const GHOST_BUTTON = 'rounded-tab border border-border-subtle px-3 py-1 text-fg-muted transition-colors duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent';

function Dots({ value, onPick, className }: { value: string; onPick: (color: string) => void; className: string }) {
  return (
    <div className={className}>
      {ARC_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Color ${color}`}
          onClick={() => onPick(color)}
          className="h-4 w-4 rounded-full"
          style={{ background: color, outline: value === color ? `2px solid ${color}` : 'none', outlineOffset: 2 }}
        />
      ))}
    </div>
  );
}

/** A row of color dots; the chosen one is ringed. With `isCollapsible` it is a single dot that opens the palette as a popup. */
export function ColorDots({ value, onChange, isCollapsible = false }: { value: string; onChange: (color: string) => void; isCollapsible?: boolean }) {
  if (!isCollapsible) return <Dots value={value} onPick={onChange} className="flex flex-wrap items-center gap-2" />;
  return (
    <PopupPicker
      label="Change color"
      triggerClassName="flex h-7 w-7 items-center justify-center rounded-tab transition-colors duration-panel ease-panel hover:bg-border-subtle"
      trigger={<span className="block h-4 w-4 rounded-full" style={{ background: value }} />}
    >
      {(close) => <Dots value={value} onPick={(color) => { onChange(color); close(); }} className="grid grid-cols-5 gap-2.5" />}
    </PopupPicker>
  );
}

export function NewArcForm({ onSave, onCancel }: { onSave: (name: string, colorHex: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState<string>(DEFAULT_ARC_COLOR);
  const commit = () => (name.trim() ? onSave(name.trim(), colorHex) : onCancel());
  return (
    <div className="flex flex-col gap-3 rounded-tab border border-border-subtle p-3">
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') onCancel(); }}
        placeholder="Arc name…"
        className={FIELD_CLASS}
      />
      <ColorDots value={colorHex} onChange={setColorHex} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={GHOST_BUTTON}>Cancel</button>
        <button type="button" onClick={commit} className={GHOST_BUTTON}>Create</button>
      </div>
    </div>
  );
}
