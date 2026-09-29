import type { TagCount } from '../../db/queries/tags';

const MIN_FONT_REM = 0.74;
const MAX_FONT_REM = 1.2;
const HEAVY_WEIGHT_THRESHOLD = 0.6;

interface TagCloudProps {
  tags: TagCount[];
  onSelect: (tag: string) => void;
}

/** Tags as a weighted cloud — font size and weight scale with each tag's
 *  usage against the busiest one, so the vault's main themes stand out
 *  instead of every tag getting an identical chip. */
export function TagCloud({ tags, onSelect }: TagCloudProps) {
  const maxCount = Math.max(1, ...tags.map((tag) => tag.count));

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
      {tags.map((tag) => {
        const weight = tag.count / maxCount;
        return (
          <button
            key={tag.name}
            type="button"
            onClick={() => onSelect(tag.name)}
            className="text-accent-tag transition-opacity duration-panel hover:opacity-70"
            style={{
              fontSize: `${MIN_FONT_REM + weight * (MAX_FONT_REM - MIN_FONT_REM)}rem`,
              fontWeight: weight > HEAVY_WEIGHT_THRESHOLD ? 700 : 500,
            }}
          >
            #{tag.name}
            <sup className="ml-0.5 text-fg-faint" style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.6rem' }}>
              {tag.count}
            </sup>
          </button>
        );
      })}
    </div>
  );
}
