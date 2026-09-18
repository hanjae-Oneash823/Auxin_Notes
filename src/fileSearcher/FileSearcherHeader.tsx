import { Fragment } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NODE_TRANSITION } from './FileSearcherNode';

/** Deeper paths collapse their leading segments into a single "…", so the
 *  breadcrumb never outgrows the header strip. */
const MAX_CRUMB_SEGMENTS = 3;
const CRUMB_SEPARATOR = ' › ';

/** Both slots are stacked in the same spot and crossfade, so switching
 *  between breadcrumb and filter never shifts the list below. */
const SLOT_CLASS = 'absolute inset-0 flex items-center justify-center';
const CROSSFADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: NODE_TRANSITION,
};

interface FileSearcherHeaderProps {
  /** null when no vault is open — the strip then stays empty. */
  vaultName: string | null;
  /** The current level, vault-relative ('' = root). */
  folderPath: string;
  filterText: string;
}

function crumbSegments(vaultName: string, folderPath: string): string[] {
  const segments = [vaultName, ...folderPath.split('/').filter(Boolean)];
  if (segments.length <= MAX_CRUMB_SEGMENTS) return segments;
  return ['…', ...segments.slice(-(MAX_CRUMB_SEGMENTS - 1))];
}

/** The strip above the list: where you are (vault › folder › folder) while
 *  idle, replaced by the filter text as soon as you type. Both sit on the
 *  same opaque black fill as the list's own names, so they stay legible over
 *  whatever app the transparent panel is floating above. Only the filter gets
 *  a border — the breadcrumb is borderless and dim so it reads as a location,
 *  not as another item you could select. */
export function FileSearcherHeader({ vaultName, folderPath, filterText }: FileSearcherHeaderProps) {
  const segments = vaultName === null ? [] : crumbSegments(vaultName, folderPath);

  return (
    <div className="relative h-6 shrink-0">
      <AnimatePresence initial={false}>
        {filterText ? (
          <motion.div key="filter" className={SLOT_CLASS} {...CROSSFADE}>
            <span
              className="inline-flex max-w-full items-center gap-0.5 whitespace-pre border border-white/80 bg-black px-2 py-0.5 leading-4 text-white"
              style={{ fontSize: '0.85rem' }}
            >
              {filterText}
              <span className="h-[1em] w-px shrink-0 animate-pulse bg-white" />
            </span>
          </motion.div>
        ) : segments.length > 0 ? (
          <motion.div key="crumb" className={SLOT_CLASS} {...CROSSFADE}>
            <span
              className="max-w-full truncate bg-black px-2 py-0.5 leading-4 text-white/35"
              style={{ fontSize: '0.72rem' }}
            >
              {segments.map((segment, index) => (
                <Fragment key={index}>
                  {index > 0 && CRUMB_SEPARATOR}
                  <span className={index === segments.length - 1 ? 'text-white/70' : undefined}>{segment}</span>
                </Fragment>
              ))}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
