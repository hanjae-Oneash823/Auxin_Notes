import type { StickyNote } from '../../db/queries/sticky';

/** Alternating tilt so the pinned notes read as slips of paper stuck to the
 *  page, not a grid of buttons. Straightens on hover. */
const TILT_DEGREES = [-1.2, 0.9, 0.6, -0.8];

interface PinnedPapersProps {
  notes: StickyNote[];
  onOpen: () => void;
}

function stickyLabel(note: StickyNote): string {
  if (note.title) return note.title;
  if (note.content) return note.content;
  return note.items.length > 0 ? `${note.items.length} items` : 'untitled';
}

/** Pinned sticky notes as small paper chips in each note's own sticky color —
 *  the one place on Home that uses the sticky palette, so a pinned note is
 *  recognizably the same object as on the sticky board. Every chip opens the
 *  board: a sticky note has no vault path to open directly. */
export function PinnedPapers({ notes, onOpen }: PinnedPapersProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {notes.map((note, index) => (
        <button
          key={note.id}
          type="button"
          onClick={onOpen}
          className="line-clamp-3 min-h-[3.6rem] p-2.5 text-left transition-transform duration-panel ease-panel hover:-translate-y-0.5 hover:!rotate-0"
          style={{
            backgroundColor: `var(--sticky-${note.color}-bg)`,
            borderBottom: `2px solid var(--sticky-${note.color}-border)`,
            borderRadius: 'var(--radius-sticky)',
            boxShadow: 'var(--sticky-shadow)',
            color: 'var(--sticky-ink)',
            fontSize: '0.74rem',
            lineHeight: 1.4,
            transform: `rotate(${TILT_DEGREES[index % TILT_DEGREES.length]}deg)`,
          }}
        >
          {stickyLabel(note)}
        </button>
      ))}
    </div>
  );
}
