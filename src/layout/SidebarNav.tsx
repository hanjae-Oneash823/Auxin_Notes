import type { ReactNode } from 'react';
import { CirclesThree, FilePdf, Note, Stack } from '@phosphor-icons/react';
import { useStickyStore } from '../sticky/stickyStore';
import { CountBadge } from './CountBadge';
import { SidebarPacket } from './SidebarPacket';

interface SidebarNavProps {
  isStickyMode: boolean;
  onToggleStickyMode: () => void;
  isBubbleMode: boolean;
  onToggleBubbleMode: () => void;
  isPdfsOpen: boolean;
  onTogglePdfs: () => void;
  pdfCount: number;
  isCanvasesOpen: boolean;
  onToggleCanvases: () => void;
  canvasCount: number;
}

interface NavRowProps {
  label: string;
  title?: string;
  isActive: boolean;
  onClick: () => void;
  /** A count shown in a small square at the row's right end. */
  count?: number;
  children: ReactNode;
}

function NavRow({ label, title, isActive, onClick, count, children }: NavRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={`flex w-full items-center gap-2.5 rounded-row px-2 py-1.5 text-left transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent ${
        isActive ? 'bg-border-subtle text-fg-prominent' : 'text-fg-muted'
      }`}
      style={{ fontSize: '0.85rem' }}
    >
      {children}
      <span className="truncate">{label}</span>
      {count !== undefined && <CountBadge count={count} className="ml-auto" />}
    </button>
  );
}

/** Top packet of the left sidebar. Its rows toggle a dock below it, a
 *  full-content-area mode (sticky board). Search and tags now live in the right panel's layers. The
 *  2D/3D graph views are hidden from here for now (still reachable as
 *  content-area modes, just not from this nav — see isGraphMode/
 *  isGraph2DMode in App.tsx), not removed outright. */
export function SidebarNav({
  isStickyMode,
  onToggleStickyMode,
  isBubbleMode,
  onToggleBubbleMode,
  isPdfsOpen,
  onTogglePdfs,
  pdfCount,
  isCanvasesOpen,
  onToggleCanvases,
  canvasCount,
}: SidebarNavProps) {
  const stickyCount = useStickyStore((state) => state.notes.length);

  return (
    <SidebarPacket>
      <NavRow
        label="Bubble navigator"
        title="browse folders as bubbles in the editing area"
        isActive={isBubbleMode}
        onClick={onToggleBubbleMode}
      >
        <CirclesThree size={16} className="text-accent-tag" />
      </NavRow>
      <NavRow label="Imported PDFs" isActive={isPdfsOpen} onClick={onTogglePdfs} count={pdfCount}>
        <FilePdf size={16} className="text-accent-link-broken" />
      </NavRow>
      <NavRow label="Canvases" isActive={isCanvasesOpen} onClick={onToggleCanvases} count={canvasCount}>
        <Stack size={16} className="text-accent-link" />
      </NavRow>
      <NavRow label="Sticky board" isActive={isStickyMode} onClick={onToggleStickyMode} count={stickyCount}>
        <Note size={16} />
      </NavRow>
    </SidebarPacket>
  );
}
