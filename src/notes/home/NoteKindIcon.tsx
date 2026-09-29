import { FilePdf, FileText, SquaresFour, Stack } from '@phosphor-icons/react';

interface NoteKindIconProps {
  isHub: boolean;
  isCanvas: boolean;
  isPdf?: boolean;
  size?: number;
  className?: string;
}

/** Same per-kind icon mapping as TabBar.tsx's TAB_ICONS (hub → SquaresFour,
 *  canvas → Stack, plain note → FileText) — so a hub or canvas doesn't look
 *  like an ordinary note on the dashboard. Inherits its color from the
 *  parent, like the tab cards' icons. */
export function NoteKindIcon({ isHub, isCanvas, isPdf = false, size = 13, className = '' }: NoteKindIconProps) {
  const Icon = isPdf ? FilePdf : isHub ? SquaresFour : isCanvas ? Stack : FileText;
  return <Icon size={size} className={`shrink-0 ${isPdf ? 'text-accent-link-broken' : ''} ${className}`} />;
}
