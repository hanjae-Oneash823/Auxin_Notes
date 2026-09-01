import type { NoteSummary } from '../db/queries/notes';

const RECENT_NOTES_LIMIT = 10;

interface HomeDashboardProps {
  noteCount: number;
  unresolvedCount: number;
  /** Already sorted most-recently-modified first by `listNotes` — this just slices. */
  recentNotes: NoteSummary[];
  onSelect: (path: string) => void;
}

function formatModified(modified: string): string {
  const date = new Date(modified);
  return Number.isNaN(date.getTime()) ? modified : date.toLocaleDateString();
}

/**
 * The HOME tab's content — a glanceable landing view, not a full
 * customizable dashboard: vault-wide stats plus a jump list of
 * recently-edited notes.
 */
export function HomeDashboard({ noteCount, unresolvedCount, recentNotes, onSelect }: HomeDashboardProps) {
  const recent = recentNotes.slice(0, RECENT_NOTES_LIMIT);

  return (
    <div
      className="mx-auto flex h-full flex-col gap-4 overflow-y-auto"
      style={{ maxWidth: '760px', padding: 'var(--space-content-lg)' }}
    >
      <div className="flex gap-4 text-fg-faint" style={{ fontSize: '0.75rem' }}>
        <span>
          [{noteCount} {noteCount === 1 ? 'note' : 'notes'}]
        </span>
        {unresolvedCount > 0 && (
          <span className="text-accent-link-broken">
            [{unresolvedCount} unresolved {unresolvedCount === 1 ? 'link' : 'links'}]
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
          [recent]
        </span>
        {recent.length === 0 ? (
          <span className="px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
            no notes yet
          </span>
        ) : (
          recent.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => onSelect(note.path)}
              className="flex items-center justify-between gap-3 px-1 text-left text-accent-link hover:text-fg-prominent"
              style={{ fontSize: '0.82rem' }}
            >
              <span className="truncate">{note.title}</span>
              <span className="shrink-0 text-fg-faint" style={{ fontSize: '0.7rem' }}>
                {formatModified(note.modified)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
