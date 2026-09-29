import { useRef } from 'react';
import { FilePdf, FileText, Image, Note, TextAa, TextT, Warning } from '@phosphor-icons/react';
import { PacketIconButton } from '../layout/SidebarPacket';
import type { Point } from './canvasGeometry';
import { STICKY_CARD_BG, WARNING_CARD_BG } from './canvasConstants';
import { ToolbarDivider, ToolbarShell } from './ToolbarShell';

/** Each icon is tinted like the card it creates. */
const COLOR_TEXT = 'var(--fg-prominent)';
const COLOR_TITLE = '#f2f1ee';
const COLOR_NOTE = 'var(--accent-link)';
const COLOR_PDF = 'var(--accent-link-broken)';
const COLOR_IMAGE = 'var(--accent-tag)';

const ICON_SIZE = 18;
/** The note/PDF search popover opens upward from the bar (it sits at the bottom
 *  of the canvas); this is roughly its height, so its bottom lands on the bar. */
const PICKER_HEIGHT_PX = 300;
const SCREEN_MARGIN_PX = 8;

interface NewToolbarProps {
  onAddText: () => void;
  onAddTitle: () => void;
  onAddSticky: () => void;
  onAddWarning: () => void;
  /** Open the note/PDF picker at a screen position. */
  onPickNote: (anchor: Point) => void;
  onPickPdf: (anchor: Point) => void;
  onAddImage: () => void;
}

/** Floating "new" tool strip: one button per kind of card the board can hold.
 *  New cards land at the center of the current view. */
export function NewToolbar({ onAddText, onAddTitle, onAddSticky, onAddWarning, onPickNote, onPickPdf, onAddImage }: NewToolbarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  function pickerAnchor(): Point {
    const rect = barRef.current?.getBoundingClientRect();
    return rect
      ? { x: rect.left, y: Math.max(SCREEN_MARGIN_PX, rect.top - PICKER_HEIGHT_PX) }
      : { x: SCREEN_MARGIN_PX, y: SCREEN_MARGIN_PX };
  }

  return (
    <ToolbarShell label="new" barRef={barRef}>
      <PacketIconButton title="New text card" color={COLOR_TEXT} onClick={onAddText}>
        <TextAa size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton title="New title" color={COLOR_TITLE} onClick={onAddTitle}>
        <TextT size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton title="New sticky" color={STICKY_CARD_BG} onClick={onAddSticky}>
        <Note size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton title="New warning" color={WARNING_CARD_BG} onClick={onAddWarning}>
        <Warning size={ICON_SIZE} />
      </PacketIconButton>
      <ToolbarDivider />
      <PacketIconButton title="Add note…" color={COLOR_NOTE} onClick={() => onPickNote(pickerAnchor())}>
        <FileText size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton title="Add PDF…" color={COLOR_PDF} onClick={() => onPickPdf(pickerAnchor())}>
        <FilePdf size={ICON_SIZE} />
      </PacketIconButton>
      <PacketIconButton title="Add image…" color={COLOR_IMAGE} onClick={onAddImage}>
        <Image size={ICON_SIZE} />
      </PacketIconButton>
    </ToolbarShell>
  );
}
