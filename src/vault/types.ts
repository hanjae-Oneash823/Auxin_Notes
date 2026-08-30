export interface NoteFrontmatter {
  id: string;
  created: string;
  modified: string;
  tags: string[];
}

export interface ParsedNote {
  frontmatter: NoteFrontmatter;
  /** Frontmatter block was missing/malformed — indexed as title/path only. */
  needsAttention: boolean;
  body: string;
  title: string;
  wordCount: number;
  contentHash: string;
  links: ParsedLink[];
  tags: string[];
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
