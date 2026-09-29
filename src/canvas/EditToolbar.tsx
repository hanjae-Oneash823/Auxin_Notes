import { ArrowUUpLeft, ArrowUUpRight } from '@phosphor-icons/react';
import { PacketIconButton } from '../layout/SidebarPacket';
import { ToolbarShell } from './ToolbarShell';

const ICON_SIZE = 18;
const COLOR_EDIT = 'var(--fg-muted)';

interface EditToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/** Floating "edit" tool strip. Undo/redo also answer ⌘Z / ⇧⌘Z; the buttons
 *  are the always-working path (the native Edit menu can swallow those keys). */
export function EditToolbar({ canUndo, canRedo, onUndo, onRedo }: EditToolbarProps) {
  return (
    <ToolbarShell label="edit">
      <PacketIconButton title="Undo (⌘Z)" onClick={onUndo} isDisabled={!canUndo} color={COLOR_EDIT}>
        <ArrowUUpLeft size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton title="Redo (⇧⌘Z)" onClick={onRedo} isDisabled={!canRedo} color={COLOR_EDIT}>
        <ArrowUUpRight size={ICON_SIZE} />
      </PacketIconButton>
    </ToolbarShell>
  );
}
