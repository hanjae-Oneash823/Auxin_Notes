import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { EditorState } from '@codemirror/state';
import { Anchor } from '@phosphor-icons/react';
import { Editor } from '../editor/Editor';
import { getEditorView } from '../editor/editorRegistry';
import { PacketIconButton } from '../layout/SidebarPacket';
import { PdfViewer } from './PdfViewer';
import { anchorText, findAnchorPage } from './pdfAnchors';
import { notePathForPdf } from './pdfFiles';

const MIN_PANE_PX = 320;
const DEFAULT_SPLIT = 0.5;
const DIVIDER_PX = 6;
const TRANSITION_CLASS = (isDragging: boolean) =>
  isDragging ? '' : 'transition-[width,min-width] duration-panel ease-panel';
/** Kept for the session (not persisted) so the split survives tab switches. */
let sessionSplit = DEFAULT_SPLIT;
/** PDFs whose note pane the user collapsed, kept for the session too. */
const hiddenNotePaths = new Set<string>();
/** Whether the PDF follows the note's anchors — one switch for the session. */
let sessionAutoScroll = true;
/** Wait for the cursor to settle so typing `@p12` doesn't scroll to p1 on the way. */
const ANCHOR_DEBOUNCE_MS = 250;

interface PdfViewProps {
  /** Absolute path of the PDF. */
  pdfPath: string;
  /** Whether the PDF has a fused note yet — decides split view vs. viewer only. */
  hasNote: boolean;
  vaultRoot: string;
  onNavigate: (path: string) => void;
  onRenameTitle: (newTitle: string) => Promise<void>;
  /** `initialContent` seeds the new note (used by "create anchor" on a note-less PDF). */
  onAddNote: (initialContent?: string) => void;
  readOnly: boolean;
}

/** A PDF opens in our own pdf.js viewer (PdfViewer). With a fused note it
 *  splits: PDF left, the note's normal editor right. A note-less PDF gets an
 *  "+ add note" button in the viewer's toolbar. */
export function PdfView({ pdfPath, hasNote, vaultRoot, onNavigate, onRenameTitle, onAddNote, readOnly }: PdfViewProps) {
  const notePath = notePathForPdf(pdfPath);
  const containerRef = useRef<HTMLDivElement>(null);
  // Fraction of the width given to the PDF pane.
  const [split, setSplit] = useState(sessionSplit);
  // The width transition is off while dragging so the divider tracks the cursor.
  const [isDragging, setIsDragging] = useState(false);
  const [isNoteHidden, setIsNoteHidden] = useState(() => hiddenNotePaths.has(pdfPath));
  // Hiding only collapses the pane — the editor stays mounted so nothing pending is lost.
  const isNoteShown = hasNote && !isNoteHidden;

  const [isAutoScroll, setIsAutoScroll] = useState(sessionAutoScroll);
  const isAutoScrollRef = useRef(isAutoScroll);
  const [scrollTarget, setScrollTarget] = useState<{ page: number; nonce: number } | null>(null);
  const anchorPageRef = useRef<number | null>(null);
  const anchorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (anchorTimerRef.current) clearTimeout(anchorTimerRef.current);
    },
    [],
  );

  function jumpToPage(page: number) {
    setScrollTarget((target) => ({ page, nonce: (target?.nonce ?? 0) + 1 }));
  }

  /** The anchor governing the cursor is the last `@pN` at or before it; when
   *  that changes (and following is on), the PDF scrolls to its page. Moving
   *  within one anchor's section never re-scrolls, so a manual scroll sticks. */
  function handleCursorMove(state: EditorState) {
    if (anchorTimerRef.current) clearTimeout(anchorTimerRef.current);
    anchorTimerRef.current = setTimeout(() => {
      const page = findAnchorPage(state.doc.toString(), state.selection.main.head);
      if (page === anchorPageRef.current) return;
      anchorPageRef.current = page;
      if (page !== null && isAutoScrollRef.current) jumpToPage(page);
    }, ANCHOR_DEBOUNCE_MS);
  }

  function toggleAutoScroll() {
    const next = !isAutoScroll;
    sessionAutoScroll = next;
    isAutoScrollRef.current = next;
    setIsAutoScroll(next);
    if (next && anchorPageRef.current !== null) jumpToPage(anchorPageRef.current);
  }

  /** Right-click a page → inserts `@pN` at the note's cursor (or seeds a new note with it). */
  function createAnchor(page: number) {
    const text = `${anchorText(page)} `;
    if (isNoteHidden) toggleNote();
    if (!hasNote) {
      onAddNote(text);
      return;
    }
    const view = getEditorView(notePath);
    if (!view) return;
    const head = view.state.selection.main.head;
    view.dispatch({ changes: { from: head, insert: text }, selection: { anchor: head + text.length }, scrollIntoView: true });
    view.focus();
  }

  function toggleNote() {
    if (isNoteHidden) hiddenNotePaths.delete(pdfPath);
    else hiddenNotePaths.add(pdfPath);
    setIsNoteHidden(!isNoteHidden);
  }

  function commitSplit(next: number) {
    sessionSplit = next;
    setSplit(next);
  }

  /** Drag the divider; each pane keeps at least MIN_PANE_PX. */
  function beginDrag(event: ReactMouseEvent) {
    const container = containerRef.current;
    if (event.button !== 0 || !container) return;
    event.preventDefault();
    const { left, width } = container.getBoundingClientRect();
    const minSplit = Math.min(MIN_PANE_PX / width, DEFAULT_SPLIT);
    const splitAt = (clientX: number) => Math.min(1 - minSplit, Math.max(minSplit, (clientX - left) / width));

    function handleMove(moveEvent: MouseEvent) {
      setSplit(splitAt(moveEvent.clientX));
    }
    function handleUp(upEvent: MouseEvent) {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      setIsDragging(false);
      commitSplit(splitAt(upEvent.clientX));
    }
    document.body.style.cursor = 'col-resize';
    setIsDragging(true);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  return (
    <div ref={containerRef} className="flex h-full">
      <div
        className="flex h-full min-w-0 flex-1"
        style={{ minWidth: MIN_PANE_PX }}
      >
        <PdfViewer
          path={pdfPath}
          reachesRightEdge={!isNoteShown}
          scrollTarget={scrollTarget}
          onCreateAnchor={readOnly ? undefined : createAnchor}
        >
          {hasNote && (
            <PacketIconButton
              title={isAutoScroll ? 'anchor scrolling: on' : 'anchor scrolling: off'}
              onClick={toggleAutoScroll}
            >
              <Anchor size={15} weight={isAutoScroll ? 'fill' : 'regular'} className={isAutoScroll ? 'text-accent-tag' : ''} />
            </PacketIconButton>
          )}
          <button
            type="button"
            onClick={() => (hasNote ? toggleNote() : onAddNote())}
            className="border border-border px-2 py-0.5 text-fg-muted transition-colors duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent"
            style={{ fontSize: '0.75rem' }}
          >
            {!hasNote ? '+ add note' : isNoteHidden ? 'show note' : 'hide note'}
          </button>
        </PdfViewer>
      </div>
      {hasNote && (
        <>
          <div
            onMouseDown={beginDrag}
            onDoubleClick={() => commitSplit(DEFAULT_SPLIT)}
            title="drag to resize · double-click to reset"
            inert={!isNoteShown}
            className={`group flex shrink-0 cursor-col-resize justify-center overflow-hidden ${TRANSITION_CLASS(isDragging)}`}
            style={{ width: isNoteShown ? DIVIDER_PX : 0 }}
          >
            <div className="h-full w-px bg-border transition-colors duration-panel ease-panel group-hover:bg-accent-link" />
          </div>
          {/* Collapsing just animates this pane's width to 0 — the editor stays
              mounted, and `inert` keeps the hidden pane out of tab/click reach. */}
          <div
            inert={!isNoteShown}
            className={`h-full shrink-0 overflow-hidden ${TRANSITION_CLASS(isDragging)}`}
            style={{ width: isNoteShown ? `${(1 - split) * 100}%` : 0, minWidth: isNoteShown ? MIN_PANE_PX : 0 }}
          >
            <div className="h-full" style={{ minWidth: MIN_PANE_PX }}>
              <Editor
                key={notePath}
                path={notePath}
                vaultRoot={vaultRoot}
                onNavigate={onNavigate}
                onRenameTitle={onRenameTitle}
                readOnly={readOnly}
                onCursorMove={handleCursorMove}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
