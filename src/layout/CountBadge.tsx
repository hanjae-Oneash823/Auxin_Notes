const SIZE_CLASSES = {
  md: { box: 'h-5 min-w-5', fontSize: '0.68rem' },
  sm: { box: 'h-4 min-w-4', fontSize: '0.6rem' },
} as const;

interface CountBadgeProps {
  count: number;
  /** `md` matches the sticky-board badge; `sm` is for dense rows (the file tree). */
  size?: keyof typeof SIZE_CLASSES;
  /** Extra layout classes from the caller (margins, alignment) — the badge's
   *  own look stays fixed so every count in the app reads the same. */
  className?: string;
}

/** A count in a small solid neon-green square — the sticky-board badge in
 *  SidebarNav and the per-folder note counts in FolderTree share this so both
 *  read as the same kind of number. */
export function CountBadge({ count, size = 'md', className = '' }: CountBadgeProps) {
  const { box, fontSize } = SIZE_CLASSES[size];
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center bg-accent-neon-green px-1 font-bold tabular-nums text-black ${className}`}
      style={{ fontSize }}
    >
      {count}
    </span>
  );
}
