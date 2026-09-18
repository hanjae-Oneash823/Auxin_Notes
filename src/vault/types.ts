export interface ParsedNote {
  /** ISO8601, database-owned — preserved across edits, only ever set once. */
  created: string;
  /** ISO8601, database-owned — bumped on every sync. */
  modified: string;
  body: string;
  title: string;
  wordCount: number;
  /** Hash of `body` (frontmatter-free), for change detection and the
   *  rename-matching `resolveNoteId` does against tombstoned rows. */
  contentHash: string;
  links: ParsedLink[];
  tags: string[];
  /** Body contains a parseable ```hub fenced config block — see parseHubBlock.ts. */
  isHub: boolean;
  /** Resolved scope folder for a hub note (its own config `folder`, or its
   *  containing directory when omitted); null for a non-hub note. */
  hubFolder: string | null;
  /** Resolved 'recursive' config for a hub note; meaningless for a non-hub note. */
  hubRecursive: boolean;
  /** Path ends in `.axcanvas` — a spatial board note, parsed by
   *  parseCanvas.ts instead of the markdown pipeline. Mutually exclusive
   *  with `isHub`. */
  isCanvas: boolean;
}

export interface ParsedLink {
  targetRaw: string;
  position: number;
}

export interface VaultFile {
  path: string;
  modifiedMs: number;
  size: number;
}
