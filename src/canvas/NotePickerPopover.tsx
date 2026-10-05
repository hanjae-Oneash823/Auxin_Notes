import { useEffect, useRef, useState } from 'react';
import { getDb } from '../db/client';
import { listPdfSummaries } from '../pdf/pdfEngine';

interface NoteResult {
  title: string;
  path: string;
}

interface NotePickerPopoverProps {
  vaultRoot: string;
  /** What to search: indexed notes, PDFs (listed from disk), or other canvases. */
  kind: 'note' | 'pdf' | 'canvas';
  x: number;
  y: number;
  onSelect: (path: string) => void;
  onClose: () => void;
}

/**
 * Small fixed-position search popover for picking an existing note to drop
 * onto the canvas — same floating-card chrome as `ContextMenu.tsx` (hairline
 * border, no radius, self-nudged back on-screen) rather than a modal dialog.
 * The query mirrors `wikilinkAutocomplete.ts`'s own `notes` table lookup
 * (indexed `LIKE`, capped at 20), with `is_canvas = 0` added since a canvas
 * board is not itself a "note" to drop onto the board.
 */
export function NotePickerPopover({ vaultRoot, kind, x, y, onSelect, onClose }: NotePickerPopoverProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NoteResult[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let rows: NoteResult[];
      if (kind === 'pdf') {
        const needle = query.toLowerCase();
        rows = (await listPdfSummaries(vaultRoot))
          .filter((pdf) => pdf.title.toLowerCase().includes(needle))
          .sort((a, b) => a.title.localeCompare(b.title))
          .slice(0, 20);
      } else {
        const db = await getDb(vaultRoot);
        rows = await db.select<NoteResult[]>(
          `SELECT title, path FROM notes WHERE is_deleted = 0 AND is_canvas = ${kind === 'canvas' ? 1 : 0} AND title LIKE ? ORDER BY title LIMIT 20`,
          [`%${query}%`],
        );
      }
      if (cancelled) return;
      setResults(rows);
      setHighlightIndex(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultRoot, kind, query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) onClose();
    }
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [onClose]);

  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0) el.style.left = `${Math.max(0, x - overflowX)}px`;
    if (overflowY > 0) el.style.top = `${Math.max(0, y - overflowY)}px`;
  }, [x, y]);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 flex w-[260px] flex-col border border-border bg-bg"
      style={{ left: x, top: y, fontFamily: 'var(--font-family)' }}
      // Without this, scrolling the results list bubbles as a wheel event up
      // to CanvasView.tsx's board-level `onWheel`, which treats it as a
      // zoom gesture — the popover sits inside `viewportRef`'s DOM subtree
      // (so it can share its fixed-position ancestor stacking context), so
      // nothing else stops that bubble on its own.
      onWheel={(event) => event.stopPropagation()}
    >
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          // Stops this popover's own navigation keys from also reaching
          // useCanvasKeyboardNav's window-level listener — belt-and-braces
          // alongside that hook's own `isEditingText()` INPUT check
          // (CanvasView.tsx's `titlePrompt` input does the same).
          event.stopPropagation();
          if (event.key === 'Escape') {
            onClose();
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlightIndex((index) => Math.min(index + 1, results.length - 1));
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightIndex((index) => Math.max(index - 1, 0));
            return;
          }
          if (event.key === 'Enter') {
            const target = results[highlightIndex];
            if (target) onSelect(target.path);
          }
        }}
        placeholder={kind === 'pdf' ? 'search PDFs…' : kind === 'canvas' ? 'search canvases…' : 'search notes…'}
        className="border-b border-border bg-bg px-2 py-1.5 text-fg-prominent outline-none"
        style={{ fontSize: '0.9rem' }}
      />
      <div className="max-h-[240px] overflow-y-auto py-1">
        {results.length === 0 && (
          <div className="px-2 py-1.5 text-fg-faint" style={{ fontSize: '0.84rem' }}>
            no matches
          </div>
        )}
        {results.map((row, index) => (
          <button
            key={row.path}
            type="button"
            onClick={() => onSelect(row.path)}
            onMouseEnter={() => setHighlightIndex(index)}
            title={row.path}
            className={`block w-full truncate px-2 py-1.5 text-left transition-colors duration-panel ease-panel ${
              index === highlightIndex ? 'bg-border-subtle text-fg-prominent' : 'text-fg-muted hover:bg-border-subtle hover:text-fg-prominent'
            }`}
            style={{ fontSize: '0.9rem' }}
          >
            {row.title}
          </button>
        ))}
      </div>
    </div>
  );
}
