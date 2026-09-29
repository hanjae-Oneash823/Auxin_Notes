import { DownloadSimple } from '@phosphor-icons/react';
import { PacketIconButton } from '../layout/SidebarPacket';
import { ToolbarShell } from './ToolbarShell';

interface ExportToolbarProps {
  /** Nothing to export from an empty board, or while an export is running. */
  isDisabled: boolean;
  onExportImage: () => void;
}

/** Floating "export" tool strip. */
export function ExportToolbar({ isDisabled, onExportImage }: ExportToolbarProps) {
  return (
    <ToolbarShell label="export">
      <PacketIconButton title="Export as image (PNG)" onClick={onExportImage} isDisabled={isDisabled} color="var(--fg-muted)">
        <DownloadSimple size={18} />
      </PacketIconButton>
    </ToolbarShell>
  );
}
