const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;
/** Below this a PDF reads as "0.0 MB", so it's shown in KB instead. */
const MIN_MB_BYTES = BYTES_PER_MB / 10;
/** From this many MB up, a decimal is noise ("12 MB", not "12.3 MB"). */
const WHOLE_MB_FROM = 10;

/** "[2.4 MB]" — a PDF's file size, in the app's bracketed-label style. */
export function formatPdfSize(bytes: number): string {
  if (bytes < MIN_MB_BYTES) return `[${Math.max(1, Math.round(bytes / BYTES_PER_KB))} KB]`;
  const mb = bytes / BYTES_PER_MB;
  return `[${mb >= WHOLE_MB_FROM ? Math.round(mb) : mb.toFixed(1)} MB]`;
}

/** The size label placed before a PDF's title; renders nothing when unknown. */
export function PdfSize({ bytes }: { bytes?: number | null }) {
  if (bytes == null) return null;
  return <span className="mr-1.5 shrink-0 text-fg-faint">{formatPdfSize(bytes)}</span>;
}
