import { useEffect, useMemo, useRef, useState } from 'react';
import type { NoteSummary } from '../db/queries/notes';
import { hasWindowChrome } from '../layout/WindowChrome';
import { usePanelLayoutStore } from '../layout/panelLayoutStore';
import { buildFolderTree } from '../vault/folderTree';
import { uniqueFolderName } from '../vault/folderEngine';
import { FolderBubbleCluster, type FolderActions } from './FolderBubbleCluster';

const PADDING_PX = 24;
/** Share of the room the view was first packed for that the bubbles occupy; the rest is blank space. */
const FILL_RATIO = 0.65;

interface Size {
  width: number;
  height: number;
}

interface BubbleNavigatorViewProps {
  notes: NoteSummary[];
  folderPaths: string[];
  /** `source` is the clicked bubble, for the fly-to-tab animation. */
  onSelectNote: (relativePath: string, source: SVGGElement) => void;
  /** Folder actions for the center control bundle; `folderPath` is `''` at the vault root. */
  onNewNote: (folderPath: string) => void;
  onNewCanvas: (folderPath: string) => void;
  onImportPdf: (folderPath: string) => void;
  /** Receives the full, collision-free relative path of the folder to create. */
  onCreateFolder: (relativePath: string) => void;
  onRevealInFinder: (folderPath: string) => void;
  onRenameFolder: (folderPath: string, newName: string) => void;
  /** Drag-and-drop moves; `targetFolderPath` is `''` for the vault root. */
  onMoveNote: (note: NoteSummary, targetFolderPath: string) => void;
  onMoveFolder: (folderPath: string, targetParentPath: string) => void;
}

/** The bubble navigator at full size, filling the editing area: the same
 *  cluster the Home dashboard shows. The bubbles are packed once, at the size
 *  the view first opens with, and after that the layout is only ever scaled to
 *  the room available — so hiding or showing a panel zooms it smoothly
 *  instead of re-arranging the bubbles. */
export function BubbleNavigatorView({
  notes,
  folderPaths,
  onSelectNote,
  onNewNote,
  onNewCanvas,
  onImportPdf,
  onCreateFolder,
  onRevealInFinder,
  onRenameFolder,
  onMoveNote,
  onMoveFolder,
}: BubbleNavigatorViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [breadcrumbHost, setBreadcrumbHost] = useState<HTMLDivElement | null>(null);
  // With the left panel hidden, the floating window controls (the `[auxin]`
  // label and the panel toggle, one h-9 strip tall) sit over this area's
  // top-left corner — so the breadcrumbs drop below that strip.
  const isLeftSidebarOpen = usePanelLayoutStore((state) => state.isLeftSidebarOpen);
  const isBelowWindowChrome = hasWindowChrome() && !isLeftSidebarOpen;
  const [size, setSize] = useState<Size | null>(null);
  // The packing size: fixed to the first measurement, never updated.
  const [packSize, setPackSize] = useState<Size | null>(null);
  const folderActions = useMemo<FolderActions>(
    () => ({
      onNewNote,
      onNewCanvas,
      onImportPdf,
      onRevealInFinder,
      onRenameFolder,
      onMoveFolder,
      onMoveNote: (notePath, targetFolderPath) => {
        const note = notes.find((candidate) => candidate.path === notePath);
        if (note) onMoveNote(note, targetFolderPath);
      },
      onNewSubfolder: (parentPath) => {
        const name = uniqueFolderName(folderPaths, parentPath);
        const path = parentPath ? `${parentPath}/${name}` : name;
        onCreateFolder(path);
        return path;
      },
    }),
    [notes, folderPaths, onNewNote, onNewCanvas, onImportPdf, onCreateFolder, onRevealInFinder, onRenameFolder, onMoveNote, onMoveFolder],
  );
  const root = useMemo(() => buildFolderTree(notes, folderPaths), [notes, folderPaths]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      // contentRect already excludes the padding.
      const next = { width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) };
      setSize(next);
      setPackSize((current) => current ?? next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The packed layout keeps its natural size (FILL_RATIO of the room it was
  // packed for) and only shrinks, keeping its proportions, once the available
  // room is too small to hold it — so opening a side panel eats into the blank
  // margin first instead of zooming the bubbles down.
  const scale =
    size && packSize
      ? Math.min(FILL_RATIO, size.width / packSize.width, size.height / packSize.height)
      : 0;
  const isReady = packSize !== null && packSize.width > 0 && packSize.height > 0 && scale > 0;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ padding: PADDING_PX }}
    >
      {/* The cluster portals its breadcrumbs here: the editing area's corner, not the smaller chart's. */}
      <div
        ref={setBreadcrumbHost}
        className={`absolute left-3 z-10 transition-[top] duration-panel ease-panel ${isBelowWindowChrome ? 'top-11' : 'top-3'}`}
      />
      {isReady && (
        <div style={{ width: packSize.width * scale }}>
          <FolderBubbleCluster
            root={root}
            onSelectNote={onSelectNote}
            width={packSize.width}
            height={packSize.height}
            displayWidth={packSize.width * scale}
            displayHeight={packSize.height * scale}
            breadcrumbHost={breadcrumbHost}
            folderActions={folderActions}
          />
        </div>
      )}
    </div>
  );
}
