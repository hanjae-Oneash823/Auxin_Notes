import type { CSSProperties } from 'react';
import type { RecentNoteEntry } from '../../db/queries/dashboard';
import { trackGlow } from '../../layout/trackGlow';
import { formatRelativeTime } from '../noteStats';
import { cleanExcerpt } from './cleanExcerpt';
import { NoteKindIcon } from './NoteKindIcon';

const CARD_EXCERPT_LIMIT = 140;
const TITLE_MAX_LINES = 2;
const EXCERPT_MAX_LINES = 2;
/** Per-card entrance delay step — cards rise in a quick cascade. */
const STAGGER_MS = 45;
const STAGGER_BASE_MS = 120;
/** Icon width (15) + gap (8): detail lines line up under the title, not the
 *  icon — same inset as the sidebar tab cards (TabBar.tsx). */
const DETAIL_INDENT_CLASS = 'pl-[23px]';
/** PDF cards carry a slight red wash (the sidebar's PDF red) over the usual card fills. */
const PDF_CARD_CLASS =
  'bg-[color-mix(in_srgb,var(--accent-link-broken)_10%,var(--color-packet-card-bg))] hover:bg-[color-mix(in_srgb,var(--accent-link-broken)_16%,var(--color-packet-active-bg))]';
const DEFAULT_CARD_CLASS = 'bg-bg-packet-card hover:bg-bg-packet-active';

const TITLE_STYLE: CSSProperties = {
  fontSize: '0.85rem',
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: TITLE_MAX_LINES,
  overflow: 'hidden',
};

const EXCERPT_STYLE: CSSProperties = {
  fontSize: '0.72rem',
  lineHeight: 1.45,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: EXCERPT_MAX_LINES,
  overflow: 'hidden',
};

interface RecentGridProps {
  notes: RecentNoteEntry[];
  /** `source` is the clicked card, for the fly-to-tab animation. */
  onSelect: (path: string, source: HTMLElement) => void;
}

/** Recent notes as a two-column grid of cards cut from the same cloth as the
 *  sidebar's tab cards (TabBar.tsx): rounded, borderless, filled with
 *  `--color-packet-card-bg`, a 15px kind icon beside a medium-weight title,
 *  small faint detail lines beneath. Hover does what the active tab does —
 *  lighter fill, strong border, float shadow, and the cursor-follow glow —
 *  but only on hover, so eight idle cards don't all shimmer. Hub and canvas
 *  notes carry no excerpt (see getRecentNotesRich) and simply render shorter. */
export function RecentGrid({ notes, onSelect }: RecentGridProps) {
  return (
    <div className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2">
      {notes.map((note, index) => {
        const excerpt = cleanExcerpt(note.excerpt).slice(0, CARD_EXCERPT_LIMIT);
        const age = formatRelativeTime(note.modified);
        return (
          <button
            key={note.id}
            type="button"
            onClick={(event) => onSelect(note.path, event.currentTarget)}
            onMouseMove={trackGlow}
            className={`home-rise tab-glow tab-glow-hover group flex flex-col gap-0.5 rounded-tab border border-transparent ${note.isPdf ? PDF_CARD_CLASS : DEFAULT_CARD_CLASS} px-2.5 py-2 text-left text-fg-muted transition-colors duration-panel ease-panel hover:border-[color:var(--border-strong)] hover:text-fg-prominent hover:shadow-[var(--shadow-float)]`}
            style={{ '--rise-delay': `${STAGGER_BASE_MS + index * STAGGER_MS}ms` } as CSSProperties}
          >
            <div className="flex items-start gap-2">
              <NoteKindIcon isHub={note.isHub} isCanvas={note.isCanvas} isPdf={note.isPdf} size={15} className="mt-[3px]" />
              <span className="min-w-0 flex-1 break-words font-medium" style={TITLE_STYLE}>
                {note.title}
              </span>
            </div>
            {age && (
              <span className={`truncate text-fg-faint ${DETAIL_INDENT_CLASS}`} style={{ fontSize: '0.72rem' }}>
                {age}
              </span>
            )}
            {excerpt && (
              <span className={`text-fg-faint ${DETAIL_INDENT_CLASS}`} style={EXCERPT_STYLE}>
                {excerpt}
                {note.excerpt.length > CARD_EXCERPT_LIMIT ? '…' : ''}
              </span>
            )}
            {note.tags.length > 0 && (
              <div className={`flex flex-wrap gap-x-2 pt-0.5 ${DETAIL_INDENT_CLASS}`}>
                {note.tags.map((tag) => (
                  <span key={tag} className="text-accent-tag" style={{ fontSize: '0.66rem' }}>
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
