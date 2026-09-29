import { ArrowUpRight } from '@phosphor-icons/react';
import type { RecentNoteEntry } from '../../db/queries/dashboard';
import { cleanExcerpt } from './cleanExcerpt';
import { formatRelativeTime } from '../noteStats';

const EXCERPT_LIMIT = 300;
const MONO = { fontFamily: 'var(--font-family-mono)' } as const;

interface ContinueCardProps {
  note: RecentNoteEntry;
  /** `source` is the clicked card, for the fly-to-tab animation. */
  onSelect: (path: string, source: HTMLElement) => void;
}

interface GutterEntryProps {
  label: string;
  children: string;
}

/** One label/value pair in the margin gutter — a faint tracked label over a
 *  muted value, like the gutter of a code editor rather than a metadata row. */
function GutterEntry({ label, children }: GutterEntryProps) {
  return (
    <div className="flex flex-col gap-0.5" style={MONO}>
      <span className="text-fg-faint" style={{ fontSize: '0.6rem', letterSpacing: 'var(--letter-spacing-label)', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span className="text-fg-muted" style={{ fontSize: '0.72rem' }}>
        {children}
      </span>
    </div>
  );
}

/** The dashboard's lead item — the most recently edited note, presented as
 *  the spot you left off rather than a card: no fill, no accent bar, just a
 *  ruled band with a margin gutter (age, kind, tags) beside the note's own
 *  title and opening text set in the editor's reading font. The excerpt ends
 *  in a blinking caret, so the block literally reads "cursor is here" — the
 *  hover state warms the text and the `resume` label, nothing else moves. */
export function ContinueCard({ note, onSelect }: ContinueCardProps) {
  const cleaned = cleanExcerpt(note.excerpt);
  const isTruncated = cleaned.length > EXCERPT_LIMIT || note.excerpt.length >= 320;
  const excerpt = cleaned.slice(0, EXCERPT_LIMIT).trimEnd();
  const kind = note.isHub ? 'hub' : note.isCanvas ? 'canvas' : 'note';

  return (
    <button
      type="button"
      onClick={(event) => onSelect(note.path, event.currentTarget)}
      className="home-rise group grid w-full grid-cols-[6.5rem_minmax(0,1fr)] gap-x-8 border-y border-border py-6 text-left"
    >
      <div className="flex flex-col gap-3.5 pt-1.5">
        <GutterEntry label="edited">{formatRelativeTime(note.modified)}</GutterEntry>
        <GutterEntry label="type">{kind}</GutterEntry>
        {note.tags.length > 0 && <GutterEntry label="tags">{note.tags.map((tag) => `#${tag}`).join(' ')}</GutterEntry>}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <ArrowUpRight
            size={22}
            className="mt-[0.3rem] shrink-0 text-accent-link transition-transform duration-panel ease-panel group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
          <span
            className="text-fg-prominent"
            style={{ fontSize: '1.55rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' }}
          >
            {note.title}
          </span>
        </div>
        <p
          className="max-w-[68ch] text-fg-muted transition-colors duration-panel ease-panel group-hover:text-fg-prominent"
          style={{ fontSize: '1rem', lineHeight: 1.7 }}
        >
          {excerpt}
          {isTruncated ? '…' : ''}
          <span aria-hidden className="home-caret" />
        </p>
        <span
          className="mt-1 self-start text-fg-faint transition-colors duration-panel ease-panel group-hover:text-accent-link"
          style={{ ...MONO, fontSize: '0.7rem', letterSpacing: 'var(--letter-spacing-label)' }}
        >
          resume ↵
        </span>
      </div>
    </button>
  );
}
