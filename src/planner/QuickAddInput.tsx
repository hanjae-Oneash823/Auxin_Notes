import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import type { NewNodeInput } from '../db/queries/planner/nodes';
import { usePlannerStore } from './plannerStore';
import { filterMentions, mentionOptions, mentionQueryAt, withoutMention, type MentionOption } from './quickAddMentions';

interface QuickAddInputProps {
  onCommit: (input: Pick<NewNodeInput, 'title' | 'arcId' | 'projectId' | 'groupIds'>) => void;
}

const chipStyle = (color: string) => ({ background: color, borderColor: '#000', color: '#000', fontSize: '0.78rem' });

/** Mycelium's BADGE_VARIANTS: a springy pop in from below, a quick shrink out upward. */
const CHIP_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.6, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 460, damping: 28 } },
  exit: { opacity: 0, scale: 0.5, y: -8, transition: { duration: 0.15, ease: 'easeIn' } },
};
const BOB_BASE_S = 2.6;
const BOB_STEP_S = 0.28;
const BOB_DELAY_STEP_S = 0.45;

/** Mycelium's quick-add bar: type a title, `@` opens a picker for an arc, one of
 *  its projects, or groups (several). Picks show as chips above the bar —
 *  click a chip to drop it — and ride along when Enter creates the node. */
export function QuickAddInput({ onCommit }: QuickAddInputProps) {
  const arcs = usePlannerStore((state) => state.arcs);
  const projects = usePlannerStore((state) => state.projects);
  const groups = usePlannerStore((state) => state.groups);

  const [value, setValue] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [arcId, setArcId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [groupIds, setGroupIds] = useState<readonly string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // Arrow-key navigation moves the highlight past the visible rows; keep it in view.
  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const options = useMemo(() => mentionOptions(arcs, projects, groups, arcId), [arcs, projects, groups, arcId]);
  const matches = query === null ? [] : filterMentions(options, query);
  const chips: { key: string; text: string; color: string; remove: () => void }[] = [];
  const arc = arcs.find((candidate) => candidate.id === arcId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (arc) chips.push({ key: arc.id, text: `arc · ${arc.name}`, color: arc.colorHex, remove: () => { setArcId(null); setProjectId(null); } });
  if (project) chips.push({ key: project.id, text: `project · ${project.name}`, color: '#b0b0a8', remove: () => setProjectId(null) });
  for (const id of groupIds) {
    const group = groups.find((candidate) => candidate.id === id);
    if (group) chips.push({ key: id, text: `group · ${group.name}`, color: group.colorHex, remove: () => setGroupIds((ids) => ids.filter((other) => other !== id)) });
  }

  function pick(option: MentionOption) {
    setValue(withoutMention(value, inputRef.current?.selectionStart ?? value.length));
    if (option.type === 'arc') {
      setArcId(option.id);
      setProjectId(null);
    } else if (option.type === 'project') {
      setProjectId(option.id);
    } else {
      setGroupIds((ids) => (ids.includes(option.id) ? ids.filter((id) => id !== option.id) : [...ids, option.id]));
    }
    setQuery(null);
  }

  function commit() {
    const title = value.trim();
    if (!title) return;
    onCommit({ title, arcId, projectId, groupIds: groupIds.length > 0 ? groupIds : undefined });
    setValue('');
    setArcId(null);
    setProjectId(null);
    setGroupIds([]);
    setQuery(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (query !== null && matches.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        return;
      }
      if (event.key === 'Enter') {
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

  return (
    <div className="relative min-w-0 flex-1">
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
          // Like Mycelium: leaving the bar drops the picks (the pills play their exit animation).
          setQuery(null);
          setArcId(null);
          setProjectId(null);
          setGroupIds([]);
        }}
        placeholder="Quick task — @ to tag, Enter to add"
        className="w-full rounded-tab border border-border-subtle bg-bg-packet px-3 py-2 text-fg-prominent outline-none transition-colors duration-panel ease-panel placeholder:text-fg-faint focus:border-border-strong"
      />
      {matches.length > 0 && (
        <div ref={listRef} className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto border border-border bg-bg py-1">
          {matches.map((option, index) => {
            const isOn = option.type === 'group' && groupIds.includes(option.id);
            return (
              <div
                key={option.id}
                onMouseDown={(event) => { event.preventDefault(); pick(option); }}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${index === activeIndex ? 'bg-border-subtle text-fg-prominent' : 'text-fg-muted'}`}
              >
                <span className="h-2 w-2 shrink-0" style={{ background: option.color }} />
                <span className="text-fg-faint" style={{ fontSize: '0.72rem' }}>{option.type}</span>
                <span className="truncate">{option.display}</span>
                {isOn && <span className="ml-auto" style={{ color: 'var(--accent-status-dot)' }}>✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
