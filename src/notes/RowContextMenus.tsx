import type { NoteSummary } from '../db/queries/notes';
import type { FolderNode } from '../vault/folderTree';
import { ContextMenu } from '../layout/ContextMenu';
import { agentMenuItem } from '../terminal/terminalAgent';
import { agentTargetFromPath } from '../terminal/terminalAgentPrompt';
import { isInTrash, isTrashFolder } from '../vault/trash';

export type RowContextMenu =
  | { kind: 'note'; note: NoteSummary; x: number; y: number }
  | { kind: 'folder'; node: FolderNode; x: number; y: number }
  /** Right-click on empty space; `node` is the folder that space belongs to. */
  | { kind: 'empty'; node: FolderNode; x: number; y: number };

/** The row actions every context menu offers — shared by the file tree and
 *  the file browser so both take (and forward) the same props. */
export interface RowActionProps {
  onSelect: (path: string) => void;
  onStartRename: (note: NoteSummary) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onDeleteFolder: (folderPath: string) => void;
  onRevealNote: (note: NoteSummary) => void;
  onRevealFolder: (folderPath: string) => void;
  onNewNoteInFolder: (folderPath: string) => void;
  onNewHubInFolder: (folderPath: string) => void;
  onNewCanvasInFolder: (folderPath: string) => void;
  onImportPdfInFolder: (folderPath: string) => void;
  /** Trash only: move an item back out to the vault root. */
  onRestoreNote: (note: NoteSummary) => void;
  onRestoreFolder: (folderPath: string) => void;
  onEmptyTrash: () => void;
}

interface RowContextMenusProps extends RowActionProps {
  menu: RowContextMenu | null;
  vaultRoot: string;
  onClose: () => void;
  onStartFolderRename: (node: { path: string; name: string }) => void;
  /** Creates an auto-named folder under `parentPath` and drops into its rename box. */
  onNewFolderHere: (parentPath: string) => void;
  /** Right-click on empty space offers "new folder"; the tree has its own typed-name flow for the root. */
  onNewFolderInEmpty: (node: FolderNode) => void;
}

/** Right-click menus for note rows, folder rows and empty space. */
export function RowContextMenus({
  menu,
  vaultRoot,
  onClose,
  onSelect,
  onStartRename,
  onDeleteNote,
  onDeleteFolder,
  onRevealNote,
  onRevealFolder,
  onNewNoteInFolder,
  onNewHubInFolder,
  onNewCanvasInFolder,
  onImportPdfInFolder,
  onRestoreNote,
  onRestoreFolder,
  onEmptyTrash,
  onStartFolderRename,
  onNewFolderHere,
  onNewFolderInEmpty,
}: RowContextMenusProps) {
  if (!menu) return null;

  if (menu.kind === 'note') {
    const { note } = menu;
    if (isInTrash(note.path)) {
      return (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={onClose}
          items={[
            { label: 'restore', onSelect: () => onRestoreNote(note) },
            { label: 'delete forever', onSelect: () => onDeleteNote(note), danger: true },
          ]}
        />
      );
    }
    return (
      <ContextMenu
        x={menu.x}
        y={menu.y}
        onClose={onClose}
        items={[
          { label: 'rename', onSelect: () => onStartRename(note) },
          agentMenuItem(agentTargetFromPath(`${vaultRoot}/${note.path}`, false)),
          { label: 'reveal in finder', onSelect: () => onRevealNote(note) },
          { label: 'delete', onSelect: () => onDeleteNote(note), danger: true },
        ]}
      />
    );
  }

  if (menu.kind === 'folder') {
    const { node } = menu;
    if (isInTrash(node.path)) {
      return (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={onClose}
          items={
            isTrashFolder(node.path)
              ? [{ label: 'empty trash', onSelect: onEmptyTrash, danger: true }]
              : [
                  { label: 'restore', onSelect: () => onRestoreFolder(node.path) },
                  { label: 'delete forever', onSelect: () => onDeleteFolder(node.path), danger: true },
                ]
          }
        />
      );
    }
    return (
      <ContextMenu
        x={menu.x}
        y={menu.y}
        onClose={onClose}
        items={[
          { label: 'new note here', onSelect: () => onNewNoteInFolder(node.path) },
          { label: 'new canvas here', onSelect: () => onNewCanvasInFolder(node.path) },
          { label: 'import pdf here', onSelect: () => onImportPdfInFolder(node.path) },
          // A folder either has a hub or doesn't — this swaps to "open
          // hub" once one exists rather than offering to create a second.
          node.hub
            ? { label: 'open hub', onSelect: () => node.hub && onSelect(node.hub.path) }
            : { label: 'new hub here', onSelect: () => onNewHubInFolder(node.path) },
          { label: 'new folder here', onSelect: () => onNewFolderHere(node.path) },
          { label: 'rename', onSelect: () => onStartFolderRename({ path: node.path, name: node.path.split('/').pop() ?? node.path }) },
          agentMenuItem(agentTargetFromPath(`${vaultRoot}/${node.path}`, true)),
          { label: 'reveal in finder', onSelect: () => onRevealFolder(node.path) },
          { label: 'delete', onSelect: () => onDeleteFolder(node.path), danger: true },
        ]}
      />
    );
  }

  const { node } = menu;
  if (isInTrash(node.path)) {
    return <ContextMenu x={menu.x} y={menu.y} onClose={onClose} items={[{ label: 'empty trash', onSelect: onEmptyTrash, danger: true }]} />;
  }
  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      onClose={onClose}
      items={[
        { label: 'new note', onSelect: () => onNewNoteInFolder(node.path) },
        { label: 'new canvas', onSelect: () => onNewCanvasInFolder(node.path) },
        { label: 'import pdf', onSelect: () => onImportPdfInFolder(node.path) },
        node.hub
          ? { label: 'open hub', onSelect: () => node.hub && onSelect(node.hub.path) }
          : { label: 'new hub', onSelect: () => onNewHubInFolder(node.path) },
        { label: 'new folder', onSelect: () => onNewFolderInEmpty(node) },
      ]}
    />
  );
}
