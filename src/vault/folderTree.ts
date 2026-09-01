import type { NoteSummary } from '../db/queries/notes';

export interface FolderNode {
  /** Leaf name only (e.g. "recipes"), not the full path. Empty for the root. */
  name: string;
  /** Vault-relative path, no trailing slash. Empty string for the root. */
  path: string;
  folders: FolderNode[];
  notes: NoteSummary[];
  /** Notes in this folder plus every descendant subfolder — set by
   *  `buildFolderTree`, not maintained incrementally, so it's only valid
   *  for the tree it was computed on. */
  noteCount: number;
}

/**
 * Builds the folder tree from two independent sources: every note's own
 * `path` (which implies the folders it lives in) and `folderPaths`, the
 * on-disk directory listing from `list_vault_folders`. The second source is
 * what makes an empty folder — one with no notes in it yet — show up and
 * survive a restart; deriving folders from notes alone would lose it the
 * moment nothing referenced it.
 */
export function buildFolderTree(notes: NoteSummary[], folderPaths: string[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: [], notes: [], noteCount: 0 };
  const nodesByPath = new Map<string, FolderNode>([['', root]]);

  function ensureFolder(path: string): FolderNode {
    const existing = nodesByPath.get(path);
    if (existing) return existing;

    const slashIndex = path.lastIndexOf('/');
    const name = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
    const parentPath = slashIndex >= 0 ? path.slice(0, slashIndex) : '';
    const parent = ensureFolder(parentPath);

    const node: FolderNode = { name, path, folders: [], notes: [], noteCount: 0 };
    parent.folders.push(node);
    nodesByPath.set(path, node);
    return node;
  }

  for (const folderPath of folderPaths) {
    ensureFolder(folderPath);
  }

  for (const note of notes) {
    const slashIndex = note.path.lastIndexOf('/');
    const dirPath = slashIndex >= 0 ? note.path.slice(0, slashIndex) : '';
    ensureFolder(dirPath).notes.push(note);
  }

  sortTree(root);
  computeNoteCounts(root);
  return root;
}

function sortTree(node: FolderNode): void {
  node.folders.sort((a, b) => a.name.localeCompare(b.name));
  node.notes.sort((a, b) => a.title.localeCompare(b.title));
  for (const folder of node.folders) sortTree(folder);
}

/** Sums each folder's own notes plus every descendant subfolder's, bottom-up. */
function computeNoteCounts(node: FolderNode): number {
  let total = node.notes.length;
  for (const folder of node.folders) {
    total += computeNoteCounts(folder);
  }
  node.noteCount = total;
  return total;
}

export type TreeRow =
  | { kind: 'folder'; node: FolderNode; depth: number }
  | { kind: 'note'; note: NoteSummary; depth: number; folderPath: string };

/**
 * Flattens the tree into the ordered list of rows that should actually be
 * rendered given which folders are collapsed — folders before notes at each
 * level, both alphabetical (already the case after `sortTree`). This flat
 * list is what gets virtualized, the same technique the old flat NoteList
 * used, so a large vault stays cheap to render even nested.
 *
 * Takes *collapsed* paths rather than expanded ones so a folder nobody has
 * touched yet — including one that didn't exist last render — defaults to
 * expanded with no special-casing needed to seed it into the set.
 */
export function flattenTree(root: FolderNode, collapsedPaths: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];

  function visit(node: FolderNode, depth: number): void {
    for (const folder of node.folders) {
      rows.push({ kind: 'folder', node: folder, depth });
      if (!collapsedPaths.has(folder.path)) visit(folder, depth + 1);
    }
    for (const note of node.notes) {
      rows.push({ kind: 'note', note, depth, folderPath: node.path });
    }
  }

  visit(root, 0);
  return rows;
}
