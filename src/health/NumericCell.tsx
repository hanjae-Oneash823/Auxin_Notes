import { useState } from 'react';

interface NumericCellProps {
  value: number | null;
  color: string;
  /** 0–1: how strong the heat tint is. */
  ratio: number;
  isDisabled: boolean;
  onChange: (value: number | null) => void;
}

const MIN_TINT_PERCENT = 15;
const TINT_RANGE_PERCENT = 75;

/** A day's number for a numeric habit: click to type one, Enter or blur to save
 *  (empty clears it), Escape to cancel. Tinted by how big it is next to the month's best. */
export function NumericCell({ value, color, ratio, isDisabled, onChange }: NumericCellProps) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const parsed = parseFloat(draft);
    onChange(draft.trim() === '' || Number.isNaN(parsed) ? null : parsed);
    setDraft(null);
  }

  return (
    <div
      onClick={() => !isDisabled && draft === null && setDraft(value === null ? '' : String(value))}
      className="flex h-full w-full items-center justify-center"
      style={{
        cursor: isDisabled ? 'default' : 'pointer',
        background: value === null ? 'transparent' : `color-mix(in srgb, ${color} ${MIN_TINT_PERCENT + ratio * TINT_RANGE_PERCENT}%, transparent)`,
      }}
    >
      {draft !== null ? (
        <input
          autoFocus
          value={draft}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setDraft(null);
          }}
          className="w-[85%] bg-transparent text-center text-fg-prominent outline-none"
          style={{ fontSize: '0.75rem' }}
        />
      ) : (
        <span className={value === null ? 'text-fg-faint' : 'text-fg-prominent'} style={{ fontSize: '0.75rem', opacity: value === null && isDisabled ? 0 : 1 }}>
          {value ?? '·'}
        </span>
      )}
    </div>
  );
}
