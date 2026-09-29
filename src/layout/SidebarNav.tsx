import type { ReactNode } from 'react';
import { CirclesThree, Compass, FilePdf, Note, PushPin, Trash } from '@phosphor-icons/react';
import { openFileSearcherWindow } from '../fileSearcher/openFileSearcherWindow';
import { useStickyStore } from '../sticky/stickyStore';
import { CountBadge } from './CountBadge';
import { EmptyTrashButton } from './EmptyTrashButton';
import { SidebarPacket } from './SidebarPacket';
import { TRASH_COLOR_CLASS } from '../vault/trash';

interface SidebarNavProps {
  isPinnedOpen: boolean;
  onTogglePinned: () => void;
  isStickyMode: boolean;
  onToggleStickyMode: () => void;
  isBubbleMode: boolean;
  onToggleBubbleMode: () => void;
  isPdfsOpen: boolean;
  onTogglePdfs: () => void;
  pdfCount: number;
  /** Items currently in the bin. */
  trashCount: number;
  /** Opens the right panel's file browser on the bin. */
  onOpenTrash: () => void;
  onEmptyTrash: () => void;
}

interface NavRowProps {
  label: string;
  title?: string;
  isActive: boolean;
  onClick: () => void;
  /** A count shown in a small square at the row's right end. */
  count?: number;
  isTrash?: boolean;
  /** Shown just left of the count. */
  trailing?: ReactNode;
  children: ReactNode;
}

function NavRow({ label, title, isActive, onClick, count, isTrash = false, trailing, children }: NavRowProps) {
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
      {(trailing || count !== undefined) && (
        <span className="ml-auto flex items-center gap-1.5">
          {trailing}
          {count !== undefined && <CountBadge count={count} tone={isTrash ? 'orange' : 'green'} />}
        </span>
      )}
    </button>
  );
}

/** Top packet of the left sidebar. Pinned notes toggles a dock below it; the
 *  rest toggle a full-content-area mode (sticky board) or open the visual
 *  file finder. Search and tags now live in the right panel's layers. The
 *  2D/3D graph views are hidden from here for now (still reachable as
 *  content-area modes, just not from this nav — see isGraphMode/
 *  isGraph2DMode in App.tsx), not removed outright. */
export function SidebarNav({
  isPinnedOpen,
  onTogglePinned,
  isStickyMode,
  onToggleStickyMode,
  isBubbleMode,
  onToggleBubbleMode,
  isPdfsOpen,
  onTogglePdfs,
  pdfCount,
  trashCount,
  onOpenTrash,
  onEmptyTrash,
}: SidebarNavProps) {
  const stickyCount = useStickyStore((state) => state.notes.length);

  return (
    <SidebarPacket>
      <NavRow label="Pinned notes" isActive={isPinnedOpen} onClick={onTogglePinned}>
        <PushPin size={16} />
      </NavRow>
      <NavRow
        label="File finder"
        title="open the visual file searcher (Cmd+Ctrl+F)"
        isActive={false}
        onClick={() => void openFileSearcherWindow()}
      >
        <Compass size={16} className="text-accent-tag" />
      </NavRow>
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
      <NavRow label="Sticky board" isActive={isStickyMode} onClick={onToggleStickyMode} count={stickyCount}>
        <Note size={16} />
      </NavRow>
      <NavRow label="Trash" title="open the trash in the file browser" isActive={false} onClick={onOpenTrash} count={trashCount}
        isTrash
        trailing={trashCount > 0 ? <EmptyTrashButton onClick={onEmptyTrash} /> : undefined}
      >
        <Trash size={16} className={TRASH_COLOR_CLASS} />
      </NavRow>
    </SidebarPacket>
  );
}
