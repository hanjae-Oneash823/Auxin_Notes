import { FilePdf } from '@phosphor-icons/react';
import type { NoteSummary } from '../db/queries/notes';
import { FileDock } from '../layout/FileDock';
import { PdfSize } from './PdfSize';

interface ImportedPdfsDockProps {
  pdfs: NoteSummary[];
  /** Vault-relative path of the open tab, to highlight its card. */
  activePath: string | null;
  /** `source` is the clicked card, for the fly-to-tab animation. */
  onSelect: (path: string, source?: HTMLElement) => void;
}

/** Searchable list of every PDF in the vault, with each file's size. */
export function ImportedPdfsDock({ pdfs, activePath, onSelect }: ImportedPdfsDockProps) {
  return (
    <FileDock
      files={pdfs}
      activePath={activePath}
      onSelect={onSelect}
      icon={<FilePdf size={15} className="shrink-0 text-accent-link-broken" />}
      searchPlaceholder="search pdfs"
      emptyText="no PDFs yet — import one with the button above."
      noMatchText="no matching PDFs."
      renderNamePrefix={(pdf) => <PdfSize bytes={pdf.sizeBytes} />}
    />
  );
}
