import { FrameCorners, House, MapTrifold, Selection } from '@phosphor-icons/react';
import { PacketIconButton } from '../layout/SidebarPacket';
import { ToolbarShell } from './ToolbarShell';

const ICON_SIZE = 18;
const COLOR_VIEW = 'var(--fg-muted)';

interface ViewToolbarProps {
  onResetView: () => void;
  onFitAll: () => void;
  onFitSelection: () => void;
  /** Nothing to frame on an empty board. */
  hasCards: boolean;
  hasSelection: boolean;
  isMinimapOpen: boolean;
  onToggleMinimap: () => void;
}

/** Floating "view" tool strip: camera shortcuts (plus the one that also recenters the cards). */
export function ViewToolbar({ onResetView, onFitAll, onFitSelection, hasCards, hasSelection, isMinimapOpen, onToggleMinimap }: ViewToolbarProps) {
  return (
    <ToolbarShell label="view">
      <PacketIconButton title="Reset view (center the cards)" onClick={onResetView} color={COLOR_VIEW}>
        <House size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton title="Zoom to fit all cards" onClick={onFitAll} isDisabled={!hasCards} color={COLOR_VIEW}>
        <FrameCorners size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton title="Zoom to selection" onClick={onFitSelection} isDisabled={!hasSelection} color={COLOR_VIEW}>
        <Selection size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton
        title={isMinimapOpen ? 'Hide minimap' : 'Show minimap'}
        onClick={onToggleMinimap}
        color={isMinimapOpen ? 'var(--accent-link)' : COLOR_VIEW}
      >
        <MapTrifold size={ICON_SIZE} weight={isMinimapOpen ? 'fill' : 'regular'} />
      </PacketIconButton>
    </ToolbarShell>
  );
}
