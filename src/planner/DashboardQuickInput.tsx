import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import type { Pool } from '../db/queries/planner/types';
import { POOL_STYLES, POOL_TOKEN } from './dashboardPools';
import { usePlannerStore } from './plannerStore';
import { mentionQueryAt, withoutMention } from './quickAddMentions';

export interface QuickCapture {
  title: string;
  pool: Pool;
  arcId: string | null;
  /** Where the bar sat when Enter was pressed, so the card can fly out of it. */
  fromRect: DOMRect | null;
}

interface QuickInputProps {
  onCommit: (capture: QuickCapture) => void;
  /** Where the card would land right now, so the board can light that column up. */
  onPreviewPool: (pool: Pool | null) => void;
}

interface MentionChoice {
  key: string;
  /** What `@` filters on: `hot`, `arc-School`. */
  label: string;
  display: string;
  kind: 'pool' | 'arc';
  color: string;
  pool?: Pool;
  arcId?: string;
}

/** The order the `@` picker lists pools in. */
const PICKER_ORDER: readonly Pool[] = ['grill', 'hot', 'cold', 'freezer', 'inbox'];

const POOL_CHOICES: readonly MentionChoice[] = PICKER_ORDER.map((pool): MentionChoice => ({
  key: pool, label: pool, display: POOL_STYLES[pool].label, kind: 'pool', color: POOL_STYLES[pool].color, pool,
}));

const DEFAULT_POOL: Pool = 'inbox';

/** The original quick add's pill motion: a springy pop in from below, a quick shrink out upward, then a gentle bob. */
const CHIP_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.6, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 460, damping: 28 } },
  exit: { opacity: 0, scale: 0.5, y: -8, transition: { duration: 0.15, ease: 'easeIn' } },
};
const BOB_BASE_S = 2.6;
const BOB_STEP_S = 0.28;
const BOB_DELAY_STEP_S = 0.45;
const chipStyle = (color: string) => ({ background: color, borderColor: '#000', color: '#000', fontSize: '0.78rem' });

const typedPoolOf = (value: string): Pool | null => (POOL_TOKEN.exec(value)?.[2].toLowerCase() as Pool | undefined) ?? null;

/** The bar at the top of the Dashboard: type a task, add `@grill` / `@hot` / `@cold` / `@freezer` / `@inbox` to choose its pool (Inbox if you don't), Enter adds it. */
export function DashboardQuickInput({ onCommit, onPreviewPool }: QuickInputProps) {
  const [value, setValue] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pickedPool, setPickedPool] = useState<Pool | null>(null);
  const [pickedArcId, setPickedArcId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const arcs = usePlannerStore((state) => state.arcs);

  const choices = useMemo(() => [
    ...POOL_CHOICES,
    ...arcs.filter((candidate) => candidate.status === 'active').map((candidate): MentionChoice => ({
      key: candidate.id, label: `arc-${candidate.name.replace(/\s+/g, '_')}`, display: candidate.name, kind: 'arc', color: candidate.colorHex, arcId: candidate.id,
    })),
  ], [arcs]);

  const needle = query?.toLowerCase() ?? null;
  const matches = needle === null ? [] : choices.filter((choice) => choice.label.toLowerCase().includes(needle));
  const hasText = value.replace(POOL_TOKEN, ' ').trim() !== '';
  const targetPool = pickedPool ?? typedPoolOf(value) ?? DEFAULT_POOL;
  const arc = arcs.find((candidate) => candidate.id === pickedArcId);

  // Arrow-key navigation moves the highlight past the visible rows; keep it in view.
  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    onPreviewPool(hasText ? targetPool : null);
  }, [hasText, targetPool, onPreviewPool]);

  function pick(choice: MentionChoice) {
    setValue(withoutMention(value, inputRef.current?.selectionStart ?? value.length));
    if (choice.pool) setPickedPool(choice.pool);
    else setPickedArcId(choice.arcId ?? null);
    setQuery(null);
  }

  function commit() {
    const title = value.replace(new RegExp(POOL_TOKEN.source, 'gi'), ' ').replace(/\s+/g, ' ').trim();
    if (!title) return;
    onCommit({ title, pool: targetPool, arcId: pickedArcId, fromRect: inputRef.current?.getBoundingClientRect() ?? null });
    setValue('');
    setPickedPool(null);
    setPickedArcId(null);
    setQuery(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (matches.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(matches[Math.min(activeIndex, matches.length - 1)]);
        return;
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (query !== null) setQuery(null);
      else setValue('');
      return;
    }
    if (event.key === 'Enter') commit();
  }

  const chips: { key: string; text: string; color: string; remove: () => void }[] = [];
  if (pickedPool) chips.push({ key: 'pool', text: POOL_STYLES[pickedPool].label, color: POOL_STYLES[pickedPool].color, remove: () => setPickedPool(null) });
  if (arc) chips.push({ key: arc.id, text: `arc · ${arc.name}`, color: arc.colorHex, remove: () => setPickedArcId(null) });

  const { label: targetLabel, color: targetColor } = POOL_STYLES[targetPool];

  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="absolute bottom-full left-0 mb-1.5 flex flex-wrap gap-1">
        <AnimatePresence mode="popLayout">
          {chips.map((chip, index) => (
            <motion.span key={chip.key} layout variants={CHIP_VARIANTS} initial="initial" animate="animate" exit="exit" className="inline-flex">
              <motion.button
                type="button"
                onMouseDown={(event) => { event.preventDefault(); chip.remove(); }}
                animate={shouldReduceMotion ? undefined : { y: [0, -3, 0] }}
                transition={{ duration: BOB_BASE_S + index * BOB_STEP_S, repeat: Infinity, ease: 'easeInOut', delay: index * BOB_DELAY_STEP_S }}
                className="rounded-tab border px-2 py-0.5"
                style={chipStyle(chip.color)}
              >
                {chip.text}
              </motion.button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setQuery(mentionQueryAt(event.target.value, event.target.selectionStart ?? event.target.value.length));
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Like the original quick add: leaving the bar drops the picks (the pills play their exit animation).
          setQuery(null);
          setPickedPool(null);
          setPickedArcId(null);
        }}
        placeholder="Quick task: @grill, @hot, @cold, @freezer or @inbox picks the pool, Enter adds it"
        aria-label="Quick task"
        className="w-full rounded-tab border border-border-subtle bg-bg-packet px-3 py-2 text-fg-prominent outline-none transition-colors duration-panel ease-panel placeholder:text-fg-faint focus:border-border-strong"
      />

      <p className="px-1 text-fg-faint" style={{ fontSize: '0.72rem' }}>
        {hasText ? (
          <>Enter adds it to <span style={{ color: targetColor }}>{targetLabel}</span></>
        ) : (
          'Without a pool tag, new tasks go to Inbox. Type @ to see your options.'
        )}
      </p>

      {matches.length > 0 && (
        <div ref={listRef} className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto border border-border bg-bg py-1">
          {matches.map((choice, index) => (
            <div
              key={choice.key}
              onMouseDown={(event) => { event.preventDefault(); pick(choice); }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${index === activeIndex ? 'bg-border-subtle text-fg-prominent' : 'text-fg-muted'}`}
            >
              <span className="h-2 w-2 shrink-0" style={{ background: choice.color }} />
              <span className="text-fg-faint" style={{ fontSize: '0.72rem' }}>{choice.kind}</span>
              <span className="truncate">{choice.display}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
