import { ArrowCounterClockwise, ArrowSquareOut, Copy, DownloadSimple, FilePdf, FileText, Image, Note, TextT, Warning, LinkBreak, Plus, SelectionAll, TrashSimple } from '@phosphor-icons/react';
import type { ContextMenuItem } from '../layout/ContextMenu';
import type { CanvasCard } from '../vault/canvasTypes';

const ICON_SIZE = 13;

export interface CardMenuOptions {
  card: CanvasCard;
  /** How many cards the menu acts on — more than 1 when the right-clicked
   *  card sits inside a multi-card selection. */
  targetCount: number;
  canDuplicate: boolean;
  arrowCount: number;
  onOpenNote: () => void;
  onPromote: () => void;
  onDuplicate: () => void;
  onRemoveArrows: () => void;
  onDelete: () => void;
}

export interface BackgroundMenuOptions {
  hasCards: boolean;
  onNewCard: () => void;
  onExportImage: () => void;
  onAddTitle: () => void;
  onAddSticky: () => void;
  onAddWarning: () => void;
  onAddNote: () => void;
  onAddPdf: () => void;
  onAddImage: () => void;
  onSelectAll: () => void;
  onResetView: () => void;
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

export function buildCardMenu(options: CardMenuOptions): ContextMenuItem[] {
  const { card, targetCount, canDuplicate, arrowCount } = options;
  const isGroup = targetCount > 1;
  const items: ContextMenuItem[] = [];

  if (!isGroup && (card.content.type === 'note' || card.content.type === 'pdf')) {
    items.push({ label: card.content.type === 'pdf' ? 'Open PDF' : 'Open note', icon: <ArrowSquareOut size={ICON_SIZE} />, onSelect: options.onOpenNote });
  }
  if (!isGroup && card.content.type === 'ghost') {
    items.push({ label: 'Create note', icon: <FileText size={ICON_SIZE} />, onSelect: options.onPromote });
  }
  if (canDuplicate) {
    items.push({
      label: isGroup ? `Duplicate ${targetCount} cards` : 'Duplicate',
      icon: <Copy size={ICON_SIZE} />,
      onSelect: options.onDuplicate,
    });
  }
  if (arrowCount > 0) {
    items.push({
      label: `Remove ${arrowCount} ${plural(arrowCount, 'arrow')}`,
      icon: <LinkBreak size={ICON_SIZE} />,
      onSelect: options.onRemoveArrows,
    });
  }
  items.push({
    label: isGroup ? `Delete ${targetCount} cards` : 'Delete',
    icon: <TrashSimple size={ICON_SIZE} />,
    danger: true,
    onSelect: options.onDelete,
  });
  return items;
}

export interface ArrowMenuOptions {
  hasLabel: boolean;
  onEditLabel: () => void;
  onRemoveLabel: () => void;
  onDelete: () => void;
}

export function buildArrowMenu(options: ArrowMenuOptions): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    {
      label: options.hasLabel ? 'Edit label…' : 'Add label…',
      icon: <TextT size={ICON_SIZE} />,
      onSelect: options.onEditLabel,
    },
  ];
  if (options.hasLabel) {
    items.push({ label: 'Remove label', icon: <LinkBreak size={ICON_SIZE} />, onSelect: options.onRemoveLabel });
  }
  items.push({ label: 'Delete arrow', icon: <TrashSimple size={ICON_SIZE} />, danger: true, onSelect: options.onDelete });
  return items;
}

export function buildBackgroundMenu(options: BackgroundMenuOptions): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    { label: 'New card here', icon: <Plus size={ICON_SIZE} />, onSelect: options.onNewCard },
    { label: 'New title', icon: <TextT size={ICON_SIZE} />, onSelect: options.onAddTitle },
    { label: 'New sticky', icon: <Note size={ICON_SIZE} />, onSelect: options.onAddSticky },
    { label: 'New warning', icon: <Warning size={ICON_SIZE} />, onSelect: options.onAddWarning },
    { label: 'Add note…', icon: <FileText size={ICON_SIZE} />, onSelect: options.onAddNote },
    { label: 'Add PDF…', icon: <FilePdf size={ICON_SIZE} />, onSelect: options.onAddPdf },
  ];
  items.push({ label: 'Add image…', icon: <Image size={ICON_SIZE} />, onSelect: options.onAddImage });
  if (options.hasCards) {
    items.push({ label: 'Select all', icon: <SelectionAll size={ICON_SIZE} />, onSelect: options.onSelectAll });
    items.push({ label: 'Export as image…', icon: <DownloadSimple size={ICON_SIZE} />, onSelect: options.onExportImage });
  }
  items.push({ label: 'Reset view', icon: <ArrowCounterClockwise size={ICON_SIZE} />, onSelect: options.onResetView });
  return items;
}
