import type { NoteSummary } from '../db/queries/notes';
import type { TabItem } from './TabBar';

export interface TabGroupNode {
  /** Leaf segment only (e.g. "AI"), not the full path. Empty for the root. */
  name: string;
  /** Vault-relative path, no trailing slash. Empty string for the root. */
  path: string;
  folders: TabGroupNode[];
  /** Tabs directly in this folder (not in a descendant subfolder). */
  tabs: TabItem[];
}

/**
 * Builds a nested tree from only the currently-open tabs, keyed by each
 * tab's `folderPath`. Deliberately not `buildFolderTree` (vault/folderTree.ts)
 * — that one also materializes empty on-disk folders from a separate
 * `folderPaths` listing, which isn't wanted here: a tab group should exist
 * only while it actually contains an open tab, and vanish the instant its
 * last tab closes. The Home tab and any tab with no folder (`folderPath`
 * `''`/null/undefined) land directly in the root node's own `tabs`, so they
 * render with no group header — same as an ungrouped flat list.
 */
export function buildTabGroupTree(items: TabItem[]): TabGroupNode {
  const root: TabGroupNode = { name: '', path: '', folders: [], tabs: [] };
  const nodesByPath = new Map<string, TabGroupNode>([['', root]]);

  function ensureFolder(path: string): TabGroupNode {
    const existing = nodesByPath.get(path);
    if (existing) return existing;

    const slashIndex = path.lastIndexOf('/');
    const name = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
    const parentPath = slashIndex >= 0 ? path.slice(0, slashIndex) : '';
    const parent = ensureFolder(parentPath);

    const node: TabGroupNode = { name, path, folders: [], tabs: [] };
    parent.folders.push(node);
    nodesByPath.set(path, node);
    return node;
  }

  for (const item of items) {
    const folder = item.folderPath ? ensureFolder(item.folderPath) : root;
    folder.tabs.push(item);
  }

  sortFolders(root);
  return root;
}

function sortFolders(node: TabGroupNode): void {
  node.folders.sort((a, b) => a.name.localeCompare(b.name));
  for (const folder of node.folders) sortFolders(folder);
}

export type TabGroupRow =
  | { kind: 'group'; node: TabGroupNode; depth: number; parentPath: string }
  | { kind: 'tab'; tab: TabItem; depth: number; parentPath: string };

/** Flattens the tree into the ordered rows to render given which folder
 *  paths are collapsed — same "take collapsed paths, not expanded ones"
 *  convention as flattenTree (vault/folderTree.ts), so a folder nobody has
 *  touched yet defaults to expanded. The root's own tabs render first
 *  (Home, then any vault-root notes), each at depth 0 with no group row.
 *  `parentPath` (the containing folder each row sits directly under) lets
 *  TabBar scope drag-reorder to siblings within the same group. */
export function flattenTabGroups(root: TabGroupNode, collapsedPaths: ReadonlySet<string>): TabGroupRow[] {
  const rows: TabGroupRow[] = [];

  function visit(node: TabGroupNode, depth: number): void {
    for (const tab of node.tabs) {
      rows.push({ kind: 'tab', tab, depth, parentPath: node.path });
    }
    for (const folder of node.folders) {
      rows.push({ kind: 'group', node: folder, depth, parentPath: node.path });
      if (!collapsedPaths.has(folder.path)) visit(folder, depth + 1);
    }
  }

  visit(root, 0);
  return rows;
}

/** Buckets every vault note by its direct containing folder ("" for the
 *  vault root) — the same one-level grouping `buildTabGroupTree` does over
 *  open tabs, but over every note that exists on disk. TabBar uses this to
 *  offer "N more in this folder" under a group that's already showing (i.e.
 *  has at least one open tab), so notes sharing a folder with an open tab
 *  can be opened without leaving the tab pane. A folder with no open tabs
 *  gets no group row at all, so it has nowhere to show its bucket — that's
 *  intentional, not a gap: this is for browsing siblings of an already-open
 *  note, not a second full file browser (FolderTree already is one). */
export function groupNotesByFolder(notes: NoteSummary[]): Map<string, NoteSummary[]> {
  const byFolder = new Map<string, NoteSummary[]>();
  for (const note of notes) {
    const slashIndex = note.path.lastIndexOf('/');
    const folderPath = slashIndex >= 0 ? note.path.slice(0, slashIndex) : '';
    const bucket = byFolder.get(folderPath);
    if (bucket) bucket.push(note);
    else byFolder.set(folderPath, [note]);
  }
  for (const bucket of byFolder.values()) bucket.sort((a, b) => a.title.localeCompare(b.title));
  return byFolder;
}
