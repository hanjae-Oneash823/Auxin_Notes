import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FilePdf } from '@phosphor-icons/react';
import type { NoteSummary } from '../db/queries/notes';
import { formatFolder } from '../notes/noteStats';

// Same easing as the app's other floating chrome (ContextMenu.tsx).
const CARD_EASE = [0.22, 1, 0.36, 1] as const;
const CARD_MS = 0.16;
/** Cards past this index don't add stagger, so a long list still settles fast. */
const MAX_STAGGERED_CARDS = 8;
const STAGGER_S = 0.02;

interface ImportedPdfsDockProps {
  pdfs: NoteSummary[];
  /** Vault-relative path of the open tab, to highlight its card. */
  activePath: string | null;
  /** `source` is the clicked card, for the fly-to-tab animation. */
  onSelect: (path: string, source?: HTMLElement) => void;
}

/** Searchable flat list of every PDF in the vault (the folder tree only shows
 *  them inside their folders), alphabetical. Each is a two-line card: file
 *  name, then the folder it lives in. Search matches name or folder. */
export function ImportedPdfsDock({ pdfs, activePath, onSelect }: ImportedPdfsDockProps) {
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const needle = query.trim().toLowerCase();
  const shown = [...pdfs]
    .sort((a, b) => a.title.localeCompare(b.title))
    .filter((pdf) => !needle || pdf.path.toLowerCase().includes(needle));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && shown[0]) {
            onSelect(shown[0].path, listRef.current?.querySelector('button') ?? undefined);
          }
        }}
        placeholder="search pdfs"
        className="mx-1 shrink-0 rounded-row bg-bg px-2 py-1 text-fg-prominent outline-none placeholder:text-fg-faint"
        style={{ fontSize: '0.8rem' }}
      />
      <div ref={listRef} className="sidebar-scroll relative -mr-3.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-2.5">
        {shown.length === 0 && (
          <span className="px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
            {pdfs.length === 0 ? 'no PDFs yet — import one with the button above.' : 'no matching PDFs.'}
          </span>
        )}
        {/* popLayout: leaving cards fade out in place while the rest slide up to fill the gap. */}
        <AnimatePresence mode="popLayout">
        {shown.map((pdf, index) => (
          <motion.button
            key={pdf.path}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: CARD_MS, ease: CARD_EASE, delay: Math.min(index, MAX_STAGGERED_CARDS) * STAGGER_S },
            }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.09, ease: 'easeIn' } }}
            type="button"
            onClick={(event) => onSelect(pdf.path, event.currentTarget)}
            title={pdf.path}
            className={`flex shrink-0 flex-col gap-0.5 rounded-tab border px-2.5 py-2 text-left transition-colors duration-panel ease-panel ${
              activePath === pdf.path
                ? 'border-[color:var(--border-strong)] bg-bg-packet-active text-fg'
                : 'border-transparent bg-bg-packet-card text-fg-muted hover:text-fg-prominent'
            }`}
          >
            <span className="flex items-center gap-2">
              <FilePdf size={15} className="shrink-0 text-accent-link-broken" />
              <span className="min-w-0 flex-1 truncate font-medium" style={{ fontSize: '0.85rem' }}>
                {pdf.title}
              </span>
            </span>
            <span className="truncate pl-[23px] text-fg-faint" style={{ fontSize: '0.72rem' }}>
              {formatFolder(pdf.path)}
            </span>
          </motion.button>
        ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
