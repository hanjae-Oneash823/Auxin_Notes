import type { JSONContent } from '@tiptap/core';

/** The one place the document extension is spelled — `syncEngine.ts`,
 *  `noteTitle.ts`, `renameEngine.ts` and `App.tsx` all import it, and
 *  `vault_files.rs` mirrors it on the Rust side. */
export const DOC_EXTENSION = '.axdoc';

export const isDocPath = (path: string): boolean => path.endsWith(DOC_EXTENSION);

export type PaperSizeId = 'a3' | 'a4' | 'a5' | 'letter' | 'legal' | 'tabloid';
export type Orientation = 'portrait' | 'landscape';
export type MarginId = 'narrow' | 'normal' | 'wide';

/** CSS px at 96dpi — the unit the pagination plugin and print CSS both use. */
export const PAPER_SIZES: Record<PaperSizeId, { label: string; widthPx: number; heightPx: number; cssName: string }> = {
  a3: { label: 'A3', widthPx: 1123, heightPx: 1587, cssName: 'A3' },
  a4: { label: 'A4', widthPx: 794, heightPx: 1123, cssName: 'A4' },
  a5: { label: 'A5', widthPx: 559, heightPx: 794, cssName: 'A5' },
  letter: { label: 'Letter', widthPx: 816, heightPx: 1056, cssName: 'letter' },
  legal: { label: 'Legal', widthPx: 816, heightPx: 1344, cssName: 'legal' },
  tabloid: { label: 'Tabloid', widthPx: 1056, heightPx: 1632, cssName: '11in 17in' },
};

export const MARGIN_PX: Record<MarginId, number> = { narrow: 48, normal: 96, wide: 144 };

export interface DocPageSettings {
  size: PaperSizeId;
  orientation: Orientation;
  margin: MarginId;
}

export const DEFAULT_PAGE: DocPageSettings = { size: 'a4', orientation: 'portrait', margin: 'normal' };

export interface DocFile {
  version: 1;
  page: DocPageSettings;
  content: JSONContent;
}

export const EMPTY_DOC_CONTENT: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

export function newDocFileText(): string {
  return JSON.stringify({ version: 1, page: DEFAULT_PAGE, content: EMPTY_DOC_CONTENT } satisfies DocFile);
}

/** Resolved pixel geometry for one page setting — what the paginator is configured with. */
export function pageGeometry(page: DocPageSettings) {
  const { widthPx, heightPx } = PAPER_SIZES[page.size];
  const isLandscape = page.orientation === 'landscape';
  const margin = MARGIN_PX[page.margin];
  return {
    pageWidth: isLandscape ? heightPx : widthPx,
    pageHeight: isLandscape ? widthPx : heightPx,
    marginTop: margin,
    marginBottom: margin,
    marginLeft: margin,
    marginRight: margin,
  };
}

/** Throws on invalid JSON / wrong shape; unknown page values fall back to defaults
 *  so a hand-edited file still opens. */
export function parseDocFile(raw: string): DocFile {
  const data: unknown = JSON.parse(raw);
  if (typeof data !== 'object' || data === null) throw new Error('not a document file');
  const { version, page, content } = data as Partial<DocFile>;
  if (version !== 1) throw new Error(`unsupported document version: ${String(version)}`);
  if (typeof content !== 'object' || content === null || content.type !== 'doc') throw new Error('document has no content');
  return {
    version: 1,
    page: {
      size: page?.size && page.size in PAPER_SIZES ? page.size : DEFAULT_PAGE.size,
      orientation: page?.orientation === 'landscape' ? 'landscape' : 'portrait',
      margin: page?.margin && page.margin in MARGIN_PX ? page.margin : DEFAULT_PAGE.margin,
    },
    content,
  };
}

/** Plain text of the document, for search indexing and word count. */
export function docSearchableText(content: JSONContent): string {
  const parts: string[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === 'text' && node.text) parts.push(node.text);
    node.content?.forEach(walk);
    if (node.type && node.type !== 'text' && node.type !== 'doc') parts.push('\n');
  };
  walk(content);
  return parts.join('').replace(/\n{2,}/g, '\n').trim();
}
