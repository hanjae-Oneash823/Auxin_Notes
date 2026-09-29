import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CaretLeft, FileText, FilePdf, Folder, Stack, Trash } from '@phosphor-icons/react';
import type { NoteSummary } from '../db/queries/notes';
import { buildFolderTree, type FolderNode } from '../vault/folderTree';
import { uniqueFolderName } from '../vault/folderEngine';
import { CountBadge } from '../layout/CountBadge';
import { flyCardToTab } from '../layout/flyToTab';
import type { FolderTreeProps } from './FolderTree';
import { usePanelLayoutStore } from '../layout/panelLayoutStore';
import { RowContextMenus, type RowContextMenu } from './RowContextMenus';
import { ROOT_DROP_ID, useTreeDrag } from './useTreeDrag';
import { EmptyTrashButton } from '../layout/EmptyTrashButton';
import { PdfSize } from '../pdf/PdfSize';
import { isTrashFolder, TRASH_COLOR_CLASS } from '../vault/trash';

const SLIDE_PX = 56;
// Same easing as the app's popups (ContextMenu, imported-PDFs popup).
const SLIDE_IN = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;
const SLIDE_OUT = { duration: 0.18, ease: 'easeIn' } as const;

const slideVariants = {
  enter: (direction: 1 | -1) => ({ opacity: 0, x: direction * SLIDE_PX }),
  center: { opacity: 1, x: 0, transition: SLIDE_IN },
  exit: (direction: 1 | -1) => ({
    opacity: 0,
    x: direction * -SLIDE_PX,
    transition: SLIDE_OUT,
  }),
};

function depthOf(path: string): number {
  return path.split('/').filter(Boolean).length;
}

type MenuTarget = { kind: 'note'; note: NoteSummary } | { kind: 'folder'; node: FolderNode } | { kind: 'empty'; node: FolderNode };

interface BrowserRowProps {
  label: string;
  isActive?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  /** Set on rows that are a drop destination (folders, "..") — a note's
   *  destination is the folder being browsed, resolved by the list itself. */
  dropId?: string;
  count?: number;
  isTrash?: boolean;
  /** Shown before the label (a PDF's size). */
  prefix?: ReactNode;
  /** Shown just left of the count. */
  trailing?: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseDown?: (event: ReactMouseEvent) => void;
  onContextMenu?: (event: ReactMouseEvent) => void;
  children: ReactNode;
}

function BrowserRow({
  label,
  isActive = false,
  isDragging = false,
  isDropTarget = false,
  dropId,
  count,
  isTrash = false,
  prefix,
  trailing,
  onClick,
  onMouseDown,
  onContextMenu,
  children,
}: BrowserRowProps) {
  const tone = isDropTarget
    ? 'border-accent-link bg-border-subtle text-fg-prominent'
    : isActive
      ? 'border-transparent bg-border-subtle text-fg-prominent'
      : 'border-transparent text-fg-muted hover:bg-border-subtle hover:text-fg-prominent';
  return (
    <button
      type="button"
      data-drop-id={dropId}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      title={label}
      className={`flex w-full select-none items-center gap-2 rounded-row border px-2 py-1 text-left transition-colors duration-panel ease-panel ${tone} ${isDragging ? 'opacity-40' : ''}`}
      style={{ fontSize: '0.85rem' }}
    >
      {children}
      <span className="truncate">
        {prefix}
        {label}
      </span>
      {(trailing || (count !== undefined && count > 0)) && (
        <span className="ml-auto flex items-center gap-1.5">
          {trailing}
          {count !== undefined && count > 0 && <CountBadge count={count} size="sm" tone={isTrash ? 'orange' : 'green'} />}
        </span>
      )}
    </button>
  );
}

function RenameInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCancel}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit();
        if (event.key === 'Escape') onCancel();
      }}
      className="w-full rounded-row border border-border-strong bg-transparent px-2 py-1 text-left text-fg-prominent outline-none"
      style={{ fontSize: '0.85rem' }}
    />
  );
}

function findFolder(root: FolderNode, path: string): FolderNode {
  let node = root;
  for (const name of path.split('/').filter(Boolean)) {
    const next = node.folders.find((folder) => folder.name === name);
    if (!next) return root;
    node = next;
  }
  return node;
}

function NoteIcon({ note }: { note: NoteSummary }) {
  if (note.isPdf) return <FilePdf size={16} className="shrink-0 text-accent-link-broken" />;
  if (note.isCanvas) return <Stack size={16} className="shrink-0" />;
  return <FileText size={16} className="shrink-0" />;
}

/** Finder-style browser for the vault: shows one folder at a time, with a
 *  clickable path bar to jump up and a ".." row to step back. Rows support the
 *  same drag-to-move (onto a folder, "..", a path-bar segment, or the list
 *  background = the current folder), right-click menus and inline rename as
 *  the Files tree, sharing its handlers. */
export function FileBrowser(props: FolderTreeProps) {
  const {
    vaultRoot,
    notes,
    folderPaths,
    activePath,
    renamingNoteId,
    renameValue,
    onSelect,
    onRenameChange,
    onRenameCommit,
    onRenameCancel,
    onMoveNote,
    onMoveFolder,
    onRenameFolder,
    onNewFolderInFolder,
  } = props;
  const currentPath = usePanelLayoutStore((state) => state.browserPath);
  const setCurrentPath = usePanelLayoutStore((state) => state.setBrowserPath);
  // +1 slides in from the right (deeper), -1 from the left (back up).
  const [direction, setDirection] = useState<1 | -1>(1);
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenu | null>(null);
  const [renamingFolderPath, setRenamingFolderPath] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const { draggedItem, dropTargetId, beginDrag, consumeSuppressedClick, ghost } = useTreeDrag({ onMoveNote, onMoveFolder });

  const root = buildFolderTree(notes, folderPaths);
  // A folder deleted or renamed elsewhere falls back to the root.
  const folder = findFolder(root, currentPath);
  const segments = folder.path.split('/').filter(Boolean);
  const parentPath = segments.slice(0, -1).join('/');
  const files = folder.hub ? [folder.hub, ...folder.notes] : folder.notes;
  const dropIdFor = (path: string) => path || ROOT_DROP_ID;

  function navigate(path: string) {
    setDirection(depthOf(path) >= depthOf(currentPath) ? 1 : -1);
    setCurrentPath(path);
  }

  function guarded(handler: () => void) {
    if (!consumeSuppressedClick()) handler();
  }

  function openNote(note: NoteSummary, source: Element) {
    flyCardToTab(source, `${vaultRoot}/${note.path}`);
    onSelect(note.path);
  }

  function startFolderRename(node: { path: string; name: string }) {
    setRenamingFolderPath(node.path);
    setFolderRenameValue(node.name);
  }

  function commitFolderRename(path: string) {
    const name = folderRenameValue.trim();
    setRenamingFolderPath(null);
    if (!name || name === path.split('/').pop()) return;
    onRenameFolder(path, name);
  }

  /** Creates an auto-named folder under `parentPath` and drops into its rename box. */
  function newFolderHere(parentPath: string) {
    const name = uniqueFolderName(folderPaths, parentPath);
    const path = parentPath ? `${parentPath}/${name}` : name;
    onNewFolderInFolder(path);
    setRenamingFolderPath(path);
    setFolderRenameValue(name);
  }

  function openMenu(event: ReactMouseEvent, menu: MenuTarget) {
    event.preventDefault();
    event.stopPropagation();
    setRowContextMenu({ ...menu, x: event.clientX, y: event.clientY });
  }

  function renderNote(note: NoteSummary) {
    if (renamingNoteId === note.id) {
      return (
        <RenameInput
          key={note.id}
          value={renameValue}
          onChange={onRenameChange}
          onCommit={() => onRenameCommit(note)}
          onCancel={onRenameCancel}
        />
      );
    }
    return (
      <BrowserRow
        key={note.id}
        label={note.title}
        prefix={note.isPdf ? <PdfSize bytes={note.sizeBytes} /> : undefined}
        isActive={note.path === activePath}
        isDragging={draggedItem?.kind === 'note' && draggedItem.note.id === note.id}
        // A hub's file location *is* the folder it represents, so it isn't draggable.
        onMouseDown={note.isHub ? undefined : (event) => beginDrag({ kind: 'note', note }, event)}
        onContextMenu={(event) => openMenu(event, { kind: 'note', note })}
        onClick={(event) => guarded(() => openNote(note, event.currentTarget))}
      >
        <NoteIcon note={note} />
      </BrowserRow>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <nav aria-label="Path" className="flex shrink-0 flex-wrap items-center gap-x-0.5 px-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
        {[{ name: 'vault', path: '' }, ...segments.map((name, index) => ({ name, path: segments.slice(0, index + 1).join('/') }))].map(
          (crumb, index) => (
            <span key={crumb.path || 'vault'} className="flex items-center gap-0.5">
              {index > 0 && <span>/</span>}
              <button
                type="button"
                data-drop-id={dropIdFor(crumb.path)}
                className={`rounded-row px-0.5 hover:text-fg-prominent ${dropTargetId === dropIdFor(crumb.path) ? 'bg-border-subtle text-fg-prominent' : ''}`}
                onClick={() => navigate(crumb.path)}
              >
                {crumb.name}
              </button>
            </span>
          ),
        )}
      </nav>
      <div
        data-drop-id={dropIdFor(folder.path)}
        onContextMenu={(event) => openMenu(event, { kind: 'empty', node: folder })}
        className="sidebar-scroll relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={folder.path}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="flex flex-col"
          >
            {folder.path !== '' && (
              <BrowserRow
                label=".."
                dropId={dropIdFor(parentPath)}
                isDropTarget={dropTargetId === dropIdFor(parentPath)}
                onClick={() => navigate(parentPath)}
              >
                <CaretLeft size={16} className="shrink-0" />
              </BrowserRow>
            )}
            {folder.folders.map((child) =>
              renamingFolderPath === child.path ? (
                <RenameInput
                  key={child.path}
                  value={folderRenameValue}
                  onChange={setFolderRenameValue}
                  onCommit={() => commitFolderRename(child.path)}
                  onCancel={() => setRenamingFolderPath(null)}
                />
              ) : (
                <BrowserRow
                  key={child.path}
                  label={child.name}
                  count={child.noteCount}
                  isTrash={isTrashFolder(child.path)}
                  trailing={
                    isTrashFolder(child.path) && child.noteCount > 0 ? <EmptyTrashButton onClick={props.onEmptyTrash} /> : undefined
                  }
                  dropId={child.path}
                  isDropTarget={dropTargetId === child.path && !(draggedItem?.kind === 'folder' && draggedItem.path === child.path)}
                  isDragging={draggedItem?.kind === 'folder' && draggedItem.path === child.path}
                  onMouseDown={isTrashFolder(child.path) ? undefined : (event) => beginDrag({ kind: 'folder', path: child.path }, event)}
                  onContextMenu={(event) => openMenu(event, { kind: 'folder', node: child })}
                  onClick={() => guarded(() => navigate(child.path))}
                >
                  {isTrashFolder(child.path) ? (
                    <Trash size={16} className={`shrink-0 ${TRASH_COLOR_CLASS}`} />
                  ) : (
                    <Folder size={16} className="shrink-0 text-accent-tag" />
                  )}
                </BrowserRow>
              ),
            )}
            {files.map(renderNote)}
            {folder.folders.length === 0 && files.length === 0 && (
              <span className="px-2 py-1 text-fg-faint" style={{ fontSize: '0.75rem' }}>
                empty folder
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {ghost}
      <RowContextMenus
        menu={rowContextMenu}
        vaultRoot={vaultRoot}
        onClose={() => setRowContextMenu(null)}
        onSelect={onSelect}
        onStartRename={props.onStartRename}
        onDeleteNote={props.onDeleteNote}
        onDeleteFolder={props.onDeleteFolder}
        onRevealNote={props.onRevealNote}
        onRevealFolder={props.onRevealFolder}
        onNewNoteInFolder={props.onNewNoteInFolder}
        onNewHubInFolder={props.onNewHubInFolder}
        onNewCanvasInFolder={props.onNewCanvasInFolder}
        onImportPdfInFolder={props.onImportPdfInFolder}
        onRestoreNote={props.onRestoreNote}
        onRestoreFolder={props.onRestoreFolder}
        onEmptyTrash={props.onEmptyTrash}
        onStartFolderRename={startFolderRename}
        onNewFolderHere={newFolderHere}
        onNewFolderInEmpty={(node) => newFolderHere(node.path)}
      />
    </div>
  );
}
