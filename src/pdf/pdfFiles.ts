import type { NoteSummary } from '../db/queries/notes';

// ponytail: lowercase `.pdf` only (matches vault_files.rs); `.PDF` is ignored.
const PDF_EXTENSION = '.pdf';
const NOTE_EXTENSION = '.md';

/** A PDF and its note are one item: `Foo.pdf` + `Foo.md` in the same folder.
 *  No metadata ties them together — the shared basename is the whole link. */
export function isPdfPath(path: string): boolean {
  return path.endsWith(PDF_EXTENSION);
}

export function notePathForPdf(pdfPath: string): string {
  return `${pdfPath.slice(0, -PDF_EXTENSION.length)}${NOTE_EXTENSION}`;
}

export function pdfPathForNote(notePath: string): string {
  return `${notePath.slice(0, -NOTE_EXTENSION.length)}${PDF_EXTENSION}`;
}

/** What the folder tree / tab bar show: every indexed note except a `.md`
 *  fused to a PDF (that one is reached through the PDF), plus the PDFs.
 *  With a tag filter active only PDFs whose note is in the filtered list
 *  stay — a PDF alone carries no tags. */
export function mergePdfNotes(notes: NoteSummary[], pdfs: NoteSummary[], isFiltered: boolean): NoteSummary[] {
  const pdfPaths = new Set(pdfs.map((pdf) => pdf.path));
  const notePaths = new Set(notes.map((note) => note.path));
  const isFused = (note: NoteSummary) => note.path.endsWith(NOTE_EXTENSION) && pdfPaths.has(pdfPathForNote(note.path));
  const shownPdfs = pdfs.filter((pdf) => !isFiltered || notePaths.has(notePathForPdf(pdf.path)));
  return [...notes.filter((note) => !isFused(note)), ...shownPdfs];
}
