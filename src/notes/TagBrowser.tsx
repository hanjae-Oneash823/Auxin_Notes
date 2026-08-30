import { useEffect, useState } from 'react';
import { getDb } from '../db/client';
import { listTagsWithCounts, type TagCount } from '../db/queries/tags';
import { useVaultStore } from '../vault/vaultStore';

interface TagBrowserProps {
  vaultRoot: string;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

export function TagBrowser({ vaultRoot, selectedTag, onSelectTag }: TagBrowserProps) {
  const [tags, setTags] = useState<TagCount[]>([]);
  const syncVersion = useVaultStore((state) => state.syncVersion);

  useEffect(() => {
    void (async () => {
      const db = await getDb(vaultRoot);
      setTags(await listTagsWithCounts(db));
    })();
  }, [vaultRoot, syncVersion]);

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
        [tags]
      </span>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <button
            key={tag.name}
            type="button"
            onClick={() => onSelectTag(selectedTag === tag.name ? null : tag.name)}
            className={`border px-1.5 py-0.5 transition-colors duration-panel ease-panel ${
              selectedTag === tag.name
                ? 'border-accent-tag text-accent-tag'
                : 'border-border text-fg-muted hover:border-border-strong hover:text-fg-prominent'
            }`}
            style={{ fontSize: '0.7rem' }}
          >
            #{tag.name} <span className="text-fg-faint">{tag.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
