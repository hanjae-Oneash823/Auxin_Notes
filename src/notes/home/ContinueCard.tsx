import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';
import type { RecentNoteEntry } from '../../db/queries/dashboard';
import { cleanExcerpt } from './cleanExcerpt';
import { formatFolder, formatRelativeTime } from '../noteStats';

/** Short enough to stay within ~three lines at half width, so the caret is never clipped. */
const EXCERPT_LIMIT = 120;
/** The theme's yellow (a darker variant under the light theme). */
const FOLDER_COLOR_CLASS = 'text-[color:var(--accent-warning)]';
const MONO ={ fontFamily: 'var(--font-family-mono)' } as const;

interface ContinueCardProps {
  note: RecentNoteEntry;
  /** `source` is the clicked card, for the fly-to-tab animation. */
  onSelect: (path: string, source: HTMLElement) => void;
}

/** "5m" → "edited 5m ago"; "now" → "edited just now"; an older date stays
 *  as-is ("edited 3/4/2026"); '' (unparseable) stays empty. */
function describeEdit(age: string): string {
  if (age === '') return '';
  if (age === 'now') return 'edited just now';
  return /^\d+[mhd]$/.test(age) ? `edited ${age} ago` : `edited ${age}`;
}

/** The dashboard's lead item — the most recently edited note, as a compact
 *  rounded card sized to sit two across: title, a one-line meta strip
 *  (age · folder · kind · tags), then a short excerpt ending in a blinking caret ("cursor is here").
 *  Hover warms the excerpt and the `resume` label; nothing else moves. */
export function ContinueCard({ note, onSelect }: ContinueCardProps) {
  const cleaned = cleanExcerpt(note.excerpt);
  const isTruncated = cleaned.length > EXCERPT_LIMIT || note.excerpt.length >= 320;
  const excerpt = cleaned.slice(0, EXCERPT_LIMIT).trimEnd();
  const kind = note.isHub ? 'hub' : note.isCanvas ? 'canvas' : 'note';
  const folderSegments = formatFolder(note.path).split(' / ');
  const metaRef = useRef<HTMLSpanElement>(null);
  const [cardWidth, setCardWidth] = useState(0);
  // How many top-most folders are hidden so the meta line fits; 0 = full path.
  const [hiddenFolderCount, setHiddenFolderCount] = useState(0);

  // A new width starts the fit over from the full path (it may have grown).
  useEffect(() => {
    const element = metaRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setCardWidth(entry.contentRect.width);
      setHiddenFolderCount(0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Still overflowing? Drop one more ancestor folder and re-check next
  // render, always keeping the deepest folder. `truncate` remains the
  // fallback if even that alone doesn't fit.
  useLayoutEffect(() => {
    const element = metaRef.current;
    if (!element || hiddenFolderCount >= folderSegments.length - 1) return;
    if (element.scrollWidth > element.clientWidth) setHiddenFolderCount(hiddenFolderCount + 1);
  }, [hiddenFolderCount, cardWidth, folderSegments.length, note.modified, note.tags]);

  const meta = [
    { text: describeEdit(formatRelativeTime(note.modified)) },
    { text: folderSegments.slice(hiddenFolderCount).join(' / '), className: FOLDER_COLOR_CLASS },
    { text: kind },
    { text: note.tags.map((tag) => `#${tag}`).join(' ') },
  ].filter((part) => part.text !== '');

  return (
    <button
      type="button"
      onClick={(event) => onSelect(note.path, event.currentTarget)}
      className="home-rise tab-glow tab-glow-hover group flex w-full flex-col gap-1 rounded-tab border border-transparent bg-bg-packet-card px-3.5 py-3 text-left transition-colors duration-panel ease-panel hover:border-[color:var(--border-strong)] hover:bg-bg-packet-active hover:shadow-[var(--shadow-float)]"
    >
      <div className="flex items-baseline gap-2">
        <ArrowUpRight
          size={16}
          className="shrink-0 self-center text-accent-link transition-transform duration-panel ease-panel group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
        <span
          className="min-w-0 truncate text-fg-prominent"
          style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.01em' }}
        >
          {note.title}
        </span>
        <span
          className="ml-auto shrink-0 text-fg-faint transition-colors duration-panel ease-panel group-hover:text-accent-link"
          style={{ ...MONO, fontSize: '0.65rem', letterSpacing: 'var(--letter-spacing-label)' }}
        >
          resume ↵
        </span>
      </div>
      <span ref={metaRef} className="block w-full min-w-0 max-w-full truncate pl-6 text-fg-faint" style={{ ...MONO, fontSize: '0.65rem' }}>
        {meta.map((part, index) => (
          <span key={part.text}>
            {index > 0 && ' · '}
            <span className={part.className}>{part.text}</span>
          </span>
        ))}
      </span>
      <p
        className="max-w-[80ch] pl-6 pt-0.5 text-fg-muted transition-colors duration-panel ease-panel group-hover:text-fg-prominent"
        style={{ fontSize: '0.85rem', lineHeight: 1.55 }}
      >
        {excerpt}
        {isTruncated ? '…' : ''}
        <span aria-hidden className="home-caret" />
      </p>
    </button>
  );
}
