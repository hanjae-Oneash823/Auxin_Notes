import { ArrowClockwise, ArrowCounterClockwise, FlipHorizontal, FlipVertical, MagicWand } from '@phosphor-icons/react';
import { PacketIconButton } from '../layout/SidebarPacket';
import { OPTIMIZE_PASSES, ROTATE_STEP_DEGREES } from './canvasConstants';
import { ToolbarDivider, ToolbarShell } from './ToolbarShell';

const ICON_SIZE = 18;
const COLOR_TOOL = 'var(--fg-muted)';
const COLOR_OPTIMIZE = '#b18cf5';

interface LayoutToolbarProps {
  /** True when the tools act on the selected cards rather than the whole board. */
  isSelectionScoped: boolean;
  /** Which optimize pass is running, or null when idle. Locks every tool. */
  optimizePass: number | null;
  onOptimize: () => void;
  onFlip: (axis: 'horizontal' | 'vertical') => void;
  /** `1` turns clockwise, `-1` counterclockwise. */
  onRotate: (direction: 1 | -1) => void;
}

/** Floating "layout" tool strip: whole-board arrangement tools, acting on the
 *  selection when several cards are selected. */
export function LayoutToolbar({ isSelectionScoped, optimizePass, onOptimize, onFlip, onRotate }: LayoutToolbarProps) {
  const isBusy = optimizePass !== null;
  const scope = isSelectionScoped ? 'selected cards' : 'whole board';
  return (
    <ToolbarShell label="layout">
      <PacketIconButton title={`Optimize layout (${scope})`} onClick={onOptimize} isDisabled={isBusy} color={COLOR_OPTIMIZE}>
        <MagicWand size={ICON_SIZE} />
      </PacketIconButton>
      <ToolbarDivider />
      <PacketIconButton title={`Flip horizontally (${scope})`} onClick={() => onFlip('horizontal')} isDisabled={isBusy} color={COLOR_TOOL}>
        <FlipHorizontal size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton title={`Flip vertically (${scope})`} onClick={() => onFlip('vertical')} isDisabled={isBusy} color={COLOR_TOOL}>
        <FlipVertical size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton title={`Rotate ${ROTATE_STEP_DEGREES}° counterclockwise (${scope})`} onClick={() => onRotate(-1)} isDisabled={isBusy} color={COLOR_TOOL}>
        <ArrowCounterClockwise size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton title={`Rotate ${ROTATE_STEP_DEGREES}° clockwise (${scope})`} onClick={() => onRotate(1)} isDisabled={isBusy} color={COLOR_TOOL}>
        <ArrowClockwise size={ICON_SIZE} />
      </PacketIconButton>
      {isBusy && (
        <span className="ml-1 text-fg-faint" style={{ fontSize: '0.68rem' }}>
          {optimizePass}/{OPTIMIZE_PASSES}
        </span>
      )}
    </ToolbarShell>
  );
}
