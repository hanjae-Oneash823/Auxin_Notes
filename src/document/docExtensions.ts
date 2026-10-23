import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import { PaginationPlus } from 'tiptap-pagination-plus';
import { pageGeometry, type DocPageSettings } from '../vault/docTypes';
import { DocImage } from './DocImage';

/** Gap between sheets, in px. The gap shows the gutter color (`--doc-gutter`). */
export const PAGE_GAP_PX = 28;

export function buildDocExtensions(vaultRoot: string, page: DocPageSettings): Extensions {
  return [
    StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
    TextStyleKit,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Subscript,
    Superscript,
    TableKit.configure({ table: { resizable: true } }),
    DocImage.configure({ vaultRoot }),
    PaginationPlus.configure({
      ...pageGeometry(page),
      pageGap: PAGE_GAP_PX,
      pageGapBorderSize: 0,
      pageGapBorderColor: 'var(--doc-gutter)',
      pageBreakBackground: 'var(--doc-gutter)',
      contentMarginTop: 0,
      contentMarginBottom: 0,
      headerLeft: '',
      headerRight: '',
      footerLeft: '',
      footerRight: '{page}',
    }),
  ];
}
