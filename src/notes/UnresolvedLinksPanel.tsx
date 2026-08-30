import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../db/client';
import { getReferencingNotes, getUnresolvedLinkGroups, type LinkReference } from '../db/queries/links';
import { pathQualifiedTarget, resolveLinkTarget, type LinkCandidate } from '../vault/aliasResolution';
import { relinkRawTarget } from '../vault/renameEngine';
import { syncFile } from '../vault/syncEngine';
import { useVaultStore } from '../vault/vaultStore';

interface UnresolvedGroup {
  targetRaw: string;
  status: 'ambiguous' | 'broken';
  candidates: LinkCandidate[];
  referencedBy: LinkReference[];
}

interface UnresolvedLinksPanelProps {
  vaultRoot: string;
  /** Called with a vault-relative path when a referencing note is chosen. */
  onSelect: (path: string) => void;
  /** Called after a create/relink action changes the index, so the caller
   *  can refresh anything else depending on it (note list, tag browser). */
  onChanged: () => void;
}

/**
 * `links.target_id IS NULL` covers two different situations — genuinely
 * broken (no note has this title) and merely ambiguous (more than one
 * does) — so each raw target is re-resolved via `resolveLinkTarget` to tell
 * them apart and, for ambiguous ones, to get the candidate list. A broken
 * target offers "create note"; an ambiguous one offers "pin to <candidate>",
 * both propagating across every file that references it (`relinkRawTarget`
 * / a full re-sync), not just the one the user happens to be looking at.
 */
export function UnresolvedLinksPanel({ vaultRoot, onSelect, onChanged }: UnresolvedLinksPanelProps) {
  const [groups, setGroups] = useState<UnresolvedGroup[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const syncVersion = useVaultStore((state) => state.syncVersion);

  async function refresh() {
    const db = await getDb(vaultRoot);
    const raw = await getUnresolvedLinkGroups(db);
    const resolved = (
      await Promise.all(
        raw.map(async ({ targetRaw }): Promise<UnresolvedGroup | null> => {
          const resolution = await resolveLinkTarget(db, targetRaw);
          if (resolution.targetId) {
            // No longer actually unresolved (e.g. the target note was
            // created/synced after this link was first indexed) — persist
            // the fix so it stops resurfacing here, and drop it from the
            // list instead of mislabeling it "broken".
            await db.execute(
              'UPDATE links SET target_id = ? WHERE target_raw = ? AND target_id IS NULL',
              [resolution.targetId, targetRaw],
            );
            return null;
          }
          const referencedBy = await getReferencingNotes(db, targetRaw);
          return {
            targetRaw,
            status: resolution.status === 'ambiguous' ? 'ambiguous' : 'broken',
            candidates: resolution.candidates,
            referencedBy,
          };
        }),
      )
    ).filter((group): group is UnresolvedGroup => group !== null);
    setGroups(resolved);
  }

  useEffect(() => {
    void refresh();
  }, [vaultRoot, syncVersion]);

  async function createNoteForTarget(group: UnresolvedGroup) {
    const isPathQualified = group.targetRaw.includes('/');
    const title = isPathQualified ? (group.targetRaw.split('/').pop() ?? group.targetRaw) : group.targetRaw;
    const relativePath = isPathQualified ? `${group.targetRaw}.md` : `${title}.md`;
    const absolutePath = `${vaultRoot}/${relativePath}`;

    await invoke('write_note', { path: absolutePath, content: '' });
    await syncFile(vaultRoot, absolutePath);
    // The new note now satisfies group.targetRaw — re-sync every file that
    // referenced it so their links.target_id picks it up immediately,
    // instead of waiting until each is independently re-edited.
    for (const ref of group.referencedBy) {
      await syncFile(vaultRoot, `${vaultRoot}/${ref.path}`);
    }

    setStatus(`created "${title}"`);
    await refresh();
    onChanged();
  }

  async function pinToCandidate(group: UnresolvedGroup, candidate: LinkCandidate) {
    const result = await relinkRawTarget(vaultRoot, group.targetRaw, pathQualifiedTarget(candidate.path));
    setStatus(
      `relinked ${result.updatedCount}/${result.totalImpacted} files${
        result.failures.length > 0 ? ` — failed: ${result.failures.map((f) => f.path).join(', ')}` : ''
      }`,
    );
    await refresh();
    onChanged();
  }

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
        [unresolved links]
      </span>
      {groups.map((group) => (
        <div key={group.targetRaw} className="border border-border-subtle p-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={group.status === 'broken' ? 'text-accent-link-broken' : 'text-accent-tag'}
              style={{ fontSize: '0.8rem' }}
            >
              {group.targetRaw}
            </span>
            {group.status === 'broken' && (
              <button
                type="button"
                onClick={() => void createNoteForTarget(group)}
                className="shrink-0 text-fg-muted hover:text-fg-prominent"
                style={{ fontSize: '0.68rem' }}
              >
                + create
              </button>
            )}
          </div>
          {group.status === 'ambiguous' &&
            group.candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => void pinToCandidate(group, candidate)}
                className="block w-full truncate px-1 text-left text-accent-link hover:text-fg-prominent"
                style={{ fontSize: '0.75rem' }}
              >
                → {candidate.path}
              </button>
            ))}
          <div className="flex flex-wrap gap-2 pt-0.5">
            {group.referencedBy.map((ref) => (
              <button
                key={ref.path}
                type="button"
                onClick={() => onSelect(ref.path)}
                className="text-fg-faint hover:text-fg-muted"
                style={{ fontSize: '0.66rem' }}
              >
                {ref.title}
              </button>
            ))}
          </div>
        </div>
      ))}
      {status && (
        <span className="text-fg-faint" style={{ fontSize: '0.68rem' }}>
          [{status}]
        </span>
      )}
    </div>
  );
}
