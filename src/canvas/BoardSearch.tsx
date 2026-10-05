import type { RefObject } from 'react';
import { CaretDown, CaretUp, X } from '@phosphor-icons/react';

interface BoardSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  matchCount: number;
  /** Which match is showing, 0-based. */
  activeIndex: number;
  /** `1` for the next match, `-1` for the previous. */
  onStep: (direction: 1 | -1) => void;
  /** Clears the query and hands focus back to the board. */
  onClear: () => void;
  /** Lets ⌘F focus the box from the board. */
  inputRef: RefObject<HTMLInputElement | null>;
}

/** Find-on-board box, always floating at the top center (⌘F focuses it). Enter
 *  goes to the next match, ⇧Enter the previous, Esc clears it. The board dims everything that doesn't match. */
export function BoardSearch({ query, onQueryChange, matchCount, activeIndex, onStep, onClear, inputRef }: BoardSearchProps) {
  return (
    <div
      className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1.5 border bg-bg px-2 py-1"
      style={{ borderColor: 'var(--border-strong)' }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClear();
          else if (event.key === 'Enter') onStep(event.shiftKey ? -1 : 1);
        }}
        placeholder="find on board"
        className="w-44 bg-transparent text-fg-prominent outline-none placeholder:text-fg-faint"
        style={{ fontSize: '0.85rem' }}
      />
      <span className="min-w-[3.5ch] text-right text-fg-faint" style={{ fontSize: '0.72rem' }}>
        {query.trim() === '' ? '' : matchCount === 0 ? '0' : `${activeIndex + 1}/${matchCount}`}
      </span>
      <button type="button" title="Previous match" onClick={() => onStep(-1)} className="text-fg-faint hover:text-fg-prominent">
        <CaretUp size={13} />
      </button>
      <button type="button" title="Next match" onClick={() => onStep(1)} className="text-fg-faint hover:text-fg-prominent">
        <CaretDown size={13} />
      </button>
      {query !== '' && (
        <button type="button" title="Clear search" onClick={onClear} className="text-fg-faint hover:text-fg-prominent">
          <X size={13} />
        </button>
      )}
    </div>
  );
}
