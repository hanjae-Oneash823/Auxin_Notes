import type { NoteSummary } from '../db/queries/notes.ts';
import type { SearchResult } from '../db/queries/search.ts';
import { isInTrash } from '../vault/trash.ts';

export type SearchGroupId = 'folder' | 'title' | 'contents';

export interface SearchHit {
  file: NoteSummary;
  /** Second card line; absent means the card shows the file's folder. */
  detail?: string;
}

export interface SearchGroup {
  id: SearchGroupId;
  label: string;
  hits: SearchHit[];
}

const GROUP_LABELS: Record<SearchGroupId, string> = { folder: 'Folder', title: 'Title', contents: 'Contents' };

const folderOf = (path: string): string => path.split('/').slice(0, -1).join('/');

/**
 * Splits matches into Title (the file name matches), Contents (full-text hits
 * in the body) and Folder (the folder path matches). A file shows once, in
 * the first of those that it matches; empty groups are
 * left out. Title and Folder are plain every-word substring matches over
 * `files` (so PDFs count); Contents comes from the FTS index.
 */
export function groupSearchResults(files: readonly NoteSummary[], contentHits: readonly SearchResult[], query: string): SearchGroup[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const searchable = files.filter((file) => !isInTrash(file.path));
  const matches = (text: string) => words.every((word) => text.toLowerCase().includes(word));
  const byTitle = (a: NoteSummary, b: NoteSummary) => a.title.localeCompare(b.title);

  const title = searchable.filter((file) => matches(file.title)).sort(byTitle);
  const taken = new Set(title.map((file) => file.path));
  const byPath = new Map(searchable.map((file) => [file.path, file]));
  const contents: SearchHit[] = [];
  for (const hit of contentHits) {
    const file = byPath.get(hit.path);
    if (!file || taken.has(file.path)) continue;
    taken.add(file.path);
    contents.push({ file, detail: hit.snippet || undefined });
  }

  const folder = searchable.filter((file) => !taken.has(file.path) && matches(folderOf(file.path))).sort(byTitle);

  const groups: SearchGroup[] = [
    { id: 'title', label: GROUP_LABELS.title, hits: title.map((file) => ({ file })) },
    { id: 'contents', label: GROUP_LABELS.contents, hits: contents },
    { id: 'folder', label: GROUP_LABELS.folder, hits: folder.map((file) => ({ file })) },
  ];
  return groups.filter((group) => group.hits.length > 0);
}
