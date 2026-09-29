const SIZE_CLASSES = {
  md: { box: 'h-5 min-w-5', fontSize: '0.68rem' },
  sm: { box: 'h-4 min-w-4', fontSize: '0.6rem' },
} as const;

const TONE_CLASSES = {
  green: 'bg-accent-neon-green',
  orange: 'bg-[color:var(--accent-trash)]',
} as const;

interface CountBadgeProps {
  count: number;
  /** `md` matches the sticky-board badge; `sm` is for dense rows (the file tree). */
  size?: keyof typeof SIZE_CLASSES;
  /** Green everywhere except the trash bin, which is orange. */
  tone?: keyof typeof TONE_CLASSES;
  /** Extra layout classes from the caller (margins, alignment) — the badge's
   *  own look stays fixed so every count in the app reads the same. */
  className?: string;
}

/** A count in a small solid neon-green square — the sticky-board badge in
 *  SidebarNav and the per-folder note counts in FolderTree share this so both
 *  read as the same kind of number. */
export function CountBadge({ count, size = 'md', tone = 'green', className = '' }: CountBadgeProps) {
  const { box, fontSize } = SIZE_CLASSES[size];
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center ${TONE_CLASSES[tone]} px-1 font-bold tabular-nums text-black ${className}`}
      style={{ fontSize }}
    >
      {count}
    </span>
  );
}
