import { CirclesThree, FilePdf, Heartbeat, House, Note, Stack } from '@phosphor-icons/react';
import { useStickyStore } from '../sticky/stickyStore';
import { NavRow } from './NavRow';
import { SidebarPacket } from './SidebarPacket';

const HEALTH_PINK = '#ec4899';

interface SidebarNavProps {
  isHomeActive: boolean;
  onSelectHome: () => void;
  isHealthActive: boolean;
  onToggleHealth: () => void;
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

/** Top packet of the left sidebar. Its rows toggle a dock below it, a
 *  full-content-area mode (sticky board). Search and tags now live in the right panel's layers. The
 *  2D/3D graph views are hidden from here for now (still reachable as
 *  content-area modes, just not from this nav — see isGraphMode/
 *  isGraph2DMode in App.tsx), not removed outright. */
export function SidebarNav({
  isHomeActive,
  onSelectHome,
  isHealthActive,
  onToggleHealth,
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
      <div className="grid grid-cols-3 gap-1.5">
        <NavRow label="Home" isActive={isHomeActive} onClick={onSelectHome}>
          <House size={20} className="text-yellow-400" />
        </NavRow>
        <NavRow
          label="Bubble Navigator"
          isActive={isBubbleMode}
          onClick={onToggleBubbleMode}
        >
          <CirclesThree size={20} className="text-accent-tag" />
        </NavRow>
        <NavRow label="Imported PDFs" isActive={isPdfsOpen} onClick={onTogglePdfs} count={pdfCount}>
          <FilePdf size={20} className="text-accent-link-broken" />
        </NavRow>
        <NavRow label="Canvases" isActive={isCanvasesOpen} onClick={onToggleCanvases} count={canvasCount}>
          <Stack size={20} className="text-accent-link" />
        </NavRow>
        <NavRow label="Sticky board" isActive={isStickyMode} onClick={onToggleStickyMode} count={stickyCount}>
          <Note size={20} />
        </NavRow>
        <NavRow label="Health & habits (⌘H)" isActive={isHealthActive} onClick={onToggleHealth}>
          <Heartbeat size={20} style={{ color: HEALTH_PINK }} />
        </NavRow>
      </div>
    </SidebarPacket>
  );
}
