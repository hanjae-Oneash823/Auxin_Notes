import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { NoteSummary } from '../db/queries/notes';
import { HighlightedText } from '../canvas/HighlightedText';
import { formatFolder } from '../notes/noteStats';
import { trackGlow } from './trackGlow';

// Same easing as the app's other floating chrome (ContextMenu.tsx).
const CARD_EASE = [0.22, 1, 0.36, 1] as const;
const CARD_MS = 0.16;
/** Cards past this index don't add stagger, so a long list still settles fast. */
const MAX_STAGGERED_CARDS = 8;
const STAGGER_S = 0.02;

interface FileCardProps {
  file: NoteSummary;
  /** Position in its list, for the entrance stagger. */
  index: number;
  isActive: boolean;
  /** `source` is the clicked card, for the fly-to-tab animation. */
  onSelect: (path: string, source: HTMLElement) => void;
  /** The card's leading icon. */
  icon: ReactNode;
  /** Rendered just before the name (e.g. a file size). */
  namePrefix?: ReactNode;
  /** Second line; defaults to the file's folder. */
  detail?: string;
  /** Search words to mark in the name and second line. */
  words?: readonly string[];
}

/** Two-line vault file card shared by the PDF/canvas docks and search results:
 *  file name, then the folder it lives in (or `detail`). */
export function FileCard({ file, index, isActive, onSelect, icon, namePrefix, detail, words = [] }: FileCardProps) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: CARD_MS, ease: CARD_EASE, delay: Math.min(index, MAX_STAGGERED_CARDS) * STAGGER_S },
      }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.09, ease: 'easeIn' } }}
      type="button"
      onMouseMove={trackGlow}
      onClick={(event) => onSelect(file.path, event.currentTarget)}
      title={file.path}
      className={`tab-glow tab-glow-hover block w-full min-w-0 shrink-0 overflow-hidden rounded-tab border px-2.5 py-2 text-left transition-colors duration-panel ease-panel ${
        isActive
          ? 'border-[color:var(--border-strong)] bg-bg-packet-active text-fg'
          : 'border-transparent bg-bg-packet-card text-fg-muted hover:border-[color:var(--border-strong)] hover:bg-bg-packet-active hover:text-fg-prominent hover:shadow-[var(--shadow-float)]'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="min-w-0 flex-1 truncate font-medium" style={{ fontSize: '0.85rem' }}>
          {namePrefix}
          <HighlightedText text={file.title} words={words} />
        </span>
      </span>
      <span className="mt-0.5 block truncate pl-[23px] text-fg-faint" style={{ fontSize: '0.72rem' }}>
        <HighlightedText text={detail ?? formatFolder(file.path)} words={words} />
      </span>
    </motion.button>
  );
}
