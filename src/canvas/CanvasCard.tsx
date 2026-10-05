import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ArrowsOutCardinal, FilePdf, FileText, Stack, TrashSimple } from '@phosphor-icons/react';
import type { CanvasCard as CanvasCardData } from '../vault/canvasTypes';
import { CardTextEditor } from './CardTextEditor';
import { CanvasThumbnail } from './CanvasThumbnail';
import { HighlightedText } from './HighlightedText';
import { CardTitleField } from './CardTitleField';
import { CARD_BORDER_PX, DRAG_CLICK_THRESHOLD_PX, DIMMED_CARD_OPACITY, IMAGE_CARD_WIDTH, MAX_CARD_WIDTH, MAX_IMAGE_WIDTH, MIN_IMAGE_WIDTH, MIN_CARD_HEIGHT, MIN_CARD_WIDTH, TITLE_CARD_MAX_WIDTH, TITLE_CARD_MIN_WIDTH, LINK_CARD_MAX_WIDTH, STICKY_CARD_BG, WARNING_CARD_BG } from './canvasConstants';

/** Accent border, faded rather than solid: selection reads as a soft tint, and
 *  note cards' always-on border stays quieter than a selected one. */
export const SELECTED_BORDER = 'color-mix(in srgb, var(--accent-link) 55%, transparent)';
/** Dark grey, lifted off the near-black board so text cards read as objects. */
const INLINE_CARD_BG = 'color-mix(in srgb, var(--color-chrome-bg), white 7%)';
/** Mixed into the card fill rather than layered over the board, so the red stays
 *  a red-grey instead of going muddy brown on the near-black background. */
export const PDF_CARD_BG = 'color-mix(in srgb, var(--accent-link-broken) 22%, var(--color-packet-card-bg))';

/** Title cards: black on off-white, the one card that inverts the board's palette. */
const TITLE_CARD_BG = '#f2f1ee';

/** "Folder / Sub" for a vault-relative path, or null at the vault root. */
function folderLabel(path: string): string | null {
  const parts = path.split('/').slice(0, -1);
  return parts.length > 0 ? parts.join(' / ') : null;
}

function fileTitle(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.(md|pdf|axcanvas)$/, '');
}

interface CanvasCardProps {
  card: CanvasCardData;
  vaultRoot: string;
  zoom: number;
  isSelected: boolean;
  /** Text is editable/selectable and only the top strip drags. False: the
   *  whole card is the drag handle and its text is inert. */
  isEditing: boolean;
  onNavigate: (path: string) => void;
  onChangeBody: (cardId: string, body: string) => void;
  onChangeTitle: (cardId: string, title: string) => void;
  /** Total world-space delta since drag-start, not an absolute position —
   *  lets CanvasView.tsx apply the same dx/dy to every card in a multi-card
   *  selection for a rigid group drag. */
  onMoveBy: (cardId: string, dx: number, dy: number, isAxisLocked: boolean) => void;
  /** Reports the card's measured box whenever its content changes its size. */
  onAutoSize: (cardId: string, w: number, h: number) => void;
  /** Image cards: new display width in world px, fired continuously while the corner handle drags. */
  onResizeImage: (cardId: string, width: number) => void;
  onChangeCaption: (cardId: string, caption: string) => void;
  onPromote: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  /** `isAdditive`: ⇧ was held, so the click adds to (or toggles within) the selection. */
  onFocus: (cardId: string, isAdditive?: boolean) => void;
  /** Fires when the drag strip's pointer is released — `moved` is false for
   *  a plain click (pointer never traveled past `DRAG_CLICK_THRESHOLD_PX`),
   *  which CanvasView.tsx uses to narrow a multi-selection down to just this
   *  card rather than leaving the whole group selected. */
  onDragEnd: (cardId: string, moved: boolean) => void;
  /** Arrow-drawing: mousedown on the connector handle starts a drag that
   *  CanvasView.tsx tracks; released over another card, it creates an arrow. */
  onStartArrow: (cardId: string, event: ReactPointerEvent) => void;
  /** ⌘ is held: pressing anywhere on the card starts an arrow (see the
   *  capture handler on the root), so show the cursor that says so. */
  isLinking: boolean;
  /** Unrelated to the current selection: drawn faded so the connected cards stand out. */
  isDimmed: boolean;
  /** True only for the one card just created via typing/Tab+direction — see
   *  CanvasView.tsx's `autoFocusCardId` doc comment for why this is kept
   *  separate from `isSelected`. */
  autoFocus: boolean;
  /** Words from the board's search box, marked wherever they appear in the card's text. */
  searchWords: readonly string[];
  /** Reading mode: no dragging, editing, connecting or deleting; links still open. */
  isReadOnly: boolean;
}

/** A card's chrome (drag strip, delete, connector) is
 *  deliberately near-invisible at rest and only appears on hover/focus — a
 *  board with a dozen cards each carrying a permanent labeled title bar reads
 *  as noisy busywork rather than a spatial sketch. Three distinct looks:
 *  inline text (a bare mini-editor, no chrome baked into its content),
 *  promoted note (bold title + accent left rail + subtle tint — reads as
 *  "a real file", not another sticky note), ghost (dashed, translucent). */
export function CanvasCard({
  card,
  vaultRoot,
  zoom,
  isSelected,
  isEditing: isEditingProp,
  onNavigate,
  onChangeBody,
  onChangeTitle,
  onMoveBy,
  onAutoSize,
  onResizeImage,
  onChangeCaption,
  onPromote,
  onDelete,
  onFocus,
  onDragEnd,
  onStartArrow,
  isLinking,
  isDimmed,
  autoFocus,
  searchWords,
  isReadOnly,
}: CanvasCardProps) {
  const dragOrigin = useRef<{ pointerId: number; startClientX: number; startClientY: number; moved: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [isAddingTitle, setIsAddingTitle] = useState(false);

  // Only inline cards have text to edit; note/ghost cards always drag by any
  // part of their body.
  const isTextBlock = card.content.type === 'title' || card.content.type === 'sticky' || card.content.type === 'warning';
  const isEditing = isEditingProp && (card.content.type === 'inline' || isTextBlock);

  function handleDragPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    onFocus(card.id, event.shiftKey);
    if (event.button !== 0) return;
    dragOrigin.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
  }

  function handleDragPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragOrigin.current;
    if (!drag || drag.pointerId !== event.pointerId || isReadOnly) return;
    // Screen-pixel deltas need dividing by the board's zoom to land back in
    // world (card x/y) units — the same conversion Graph2DPanel.tsx's
    // drag-pan does for its own zoomed viewBox.
    const dx = (event.clientX - drag.startClientX) / zoom;
    const dy = (event.clientY - drag.startClientY) / zoom;
    const traveled = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
    const moved = drag.moved || traveled > DRAG_CLICK_THRESHOLD_PX;
    if (!moved) return;
    // Capture only once a real drag starts, so a plain click still reaches
    // whatever it landed on (a note card's open button, a ghost's create).
    if (!drag.moved) event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = { ...drag, moved };
    onMoveBy(card.id, dx, dy, event.shiftKey);
  }

  function handleDragPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragOrigin.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragOrigin.current = null;
    onDragEnd(card.id, drag.moved);
  }

  // Size follows content: the root has no explicit width/height, so this
  // just reports whatever the browser laid out. `offsetWidth`/`offsetHeight`
  // are unaffected by the board's zoom transform, so they're world units.
  const onAutoSizeRef = useRef(onAutoSize);
  onAutoSizeRef.current = onAutoSize;
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => onAutoSizeRef.current(card.id, el.offsetWidth, el.offsetHeight);
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [card.id]);

  const resizeOrigin = useRef<{ startClientX: number; startWidth: number } | null>(null);
  const imageWidth = card.content.type === 'image' ? (card.content.width ?? IMAGE_CARD_WIDTH) : 0;

  function handleResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Keep the card's own drag (and the board's marquee) from starting.
    event.stopPropagation();
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeOrigin.current = { startClientX: event.clientX, startWidth: imageWidth };
  }

  function handleResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = resizeOrigin.current;
    if (!origin) return;
    const width = origin.startWidth + (event.clientX - origin.startClientX) / zoom;
    onResizeImage(card.id, Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, Math.round(width))));
  }

  const captionRef = useRef<HTMLTextAreaElement>(null);
  const caption = card.content.type === 'image' ? (card.content.caption ?? '') : '';
  // Grow to fit the wrapped text — a textarea doesn't size to its content.
  useEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // scrollHeight leaves out the border, which border-box sizing counts.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, [caption, imageWidth, isSelected]);

  const dragHandlers = {
    onPointerDown: handleDragPointerDown,
    onPointerMove: handleDragPointerMove,
    onPointerUp: handleDragPointerUp,
  };
  const isNote = card.content.type === 'note';
  const isPdf = card.content.type === 'pdf';
  const isCanvasLink = card.content.type === 'canvas';
  const isTitle = card.content.type === 'title';
  /** Note and PDF cards reuse the sidebar tab-card look. */
  const isLinkCard = isNote || isPdf || isCanvasLink;
  const isGhost = card.content.type === 'ghost';
  const isInline = card.content.type === 'inline';
  /** A text card with no title yet offers the pill that adds one. */
  const canAddTitle = !isReadOnly && card.content.type === 'inline' && !card.content.title && !isAddingTitle;
  const isImage = card.content.type === 'image';

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={(event) => {
        // ⌘+drag from anywhere on the card draws an arrow — an alternative to the
        // corner handle. Captured, and swallowed, so it beats the card's own drag
        // and a text editor's ⌘+click (which would add a cursor).
        if (isReadOnly || !event.metaKey || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        onStartArrow(card.id, event);
      }}
      className={`group absolute flex flex-col border transition-opacity duration-panel ease-panel ${isLinking ? '[&_*]:!cursor-crosshair !cursor-crosshair' : ''} ${isLinkCard ? `rounded-tab ${isPdf ? '' : 'bg-bg-packet-card'}` : 'bg-bg'} ${isEditing || isReadOnly ? '' : 'cursor-grab active:cursor-grabbing'}`}
      data-canvas-card-id={card.id}
      onDoubleClick={() => card.content.type === 'canvas' && onNavigate(card.content.path)}
      style={{
        left: card.x,
        top: card.y,
        // No explicit height, and `max-content` width capped by the bounds:
        // the card hugs its content, and `onAutoSize` reports the result.
        width: 'max-content',
        maxWidth: isImage ? MAX_IMAGE_WIDTH : isTitle ? TITLE_CARD_MAX_WIDTH : isLinkCard ? LINK_CARD_MAX_WIDTH : MAX_CARD_WIDTH,
        minWidth: isImage ? MIN_IMAGE_WIDTH : isTitle ? TITLE_CARD_MIN_WIDTH : MIN_CARD_WIDTH,
        minHeight: MIN_CARD_HEIGHT,
        borderColor: isSelected ? SELECTED_BORDER : 'var(--border-default)',
        borderWidth: CARD_BORDER_PX,
        borderStyle: isGhost ? 'dashed' : 'solid',
        backgroundColor: isTitle ? TITLE_CARD_BG : card.content.type === 'sticky' ? STICKY_CARD_BG : card.content.type === 'warning' ? WARNING_CARD_BG : isPdf ? PDF_CARD_BG : card.content.type === 'inline' ? INLINE_CARD_BG : undefined,
        opacity: (isGhost ? 0.55 : 1) * (isDimmed ? DIMMED_CARD_OPACITY : 1),
      }}
      {...(isEditing ? { onPointerDown: () => onFocus(card.id) } : dragHandlers)}
    >
      {/* Thin, unlabeled drag strip — hover shows a faint grip cue rather
          than a permanent title bar. Buttons float over it, hidden until
          the card is hovered/focused. */}
      <div
        className="absolute left-0 right-0 top-0 z-10 h-2 cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        // Idle cards drag from anywhere (this strip's events bubble to the
        // root's handlers); only while editing does the strip carry them.
        {...(isEditing ? dragHandlers : {})}
      />
      {!isReadOnly && (
      <div className="pointer-events-none absolute right-1 top-1 z-20 flex items-center gap-1 opacity-0 transition-opacity duration-panel ease-panel group-hover:opacity-100">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onDelete(card.id)}
          title="Delete card"
          className="pointer-events-auto text-fg-faint hover:text-accent-link-broken"
        >
          <TrashSimple size={11} />
        </button>
      </div>
      )}
      <div className="flex min-h-0 flex-1 items-center overflow-hidden">
        {card.content.type === 'inline' && (
          <div className="flex min-w-0 flex-1 flex-col">
            {(card.content.title || isAddingTitle) && (
              <CardTitleField
                variant="heading"
                value={card.content.title ?? ''}
                onChange={(title) => onChangeTitle(card.id, title)}
                autoFocus={isAddingTitle}
                isEditable={isEditing || isAddingTitle}
                onBlur={() => setIsAddingTitle(false)}
                highlightWords={searchWords}
              />
            )}
            {/* The editor's own top padding is generous; tuck it up under a title. */}
            <div className={card.content.title || isAddingTitle ? '-mt-2' : ''}>
            <CardTextEditor
              vaultRoot={vaultRoot}
              value={card.content.body}
              onChange={(body) => onChangeBody(card.id, body)}
              onNavigate={onNavigate}
              readOnly={isReadOnly}
              autoFocus={autoFocus}
              // Reading mode leaves the text live so its links can be clicked.
              isEditable={isEditing || isReadOnly}
              highlightWords={searchWords}
            />
            </div>
          </div>
        )}
        {(card.content.type === 'title' || card.content.type === 'sticky' || card.content.type === 'warning') && (
          <CardTitleField
            variant={card.content.type}
            value={card.content.text}
            onChange={(text) => onChangeBody(card.id, text)}
            autoFocus={autoFocus}
            isEditable={isEditing}
            highlightWords={searchWords}
          />
        )}
        {(card.content.type === 'note' || card.content.type === 'pdf') && (
          <LinkCardBody path={card.content.path} isPdf={isPdf} words={searchWords} />
        )}
        {card.content.type === 'canvas' && (
          <div className="flex flex-col">
            <LinkCardBody path={card.content.path} isPdf={false} isCanvas words={searchWords} />
            <CanvasThumbnail vaultRoot={vaultRoot} path={card.content.path} />
          </div>
        )}
        {card.content.type === 'image' && (
          <div className="flex flex-col" style={{ width: imageWidth }}>
            <img
              src={convertFileSrc(`${vaultRoot}/${card.content.path}`)}
              alt={caption}
              // Lets the image export find this and inline the file (exportImage.ts).
              data-vault-path={card.content.path}
              draggable={false}
              className="block h-auto w-full"
            />
            {/* In the card's flow, so the card's frame (and every measurement
                of it: arrows, layout, selection) includes the caption. An empty
                one only appears while the card is selected, to be typed into. */}
            {(caption || (isSelected && !isReadOnly)) && (
              <textarea
                ref={captionRef}
                rows={1}
                value={caption}
                placeholder="Add caption…"
                readOnly={isReadOnly}
                onChange={(event) => onChangeCaption(card.id, event.target.value)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onFocus(card.id);
                }}
                className="block w-full resize-none overflow-hidden border-t bg-transparent px-1.5 py-1 text-center text-fg-muted outline-none placeholder:text-fg-faint"
                style={{
                  fontSize: '0.85rem',
                  lineHeight: 1.35,
                  borderColor: isSelected ? SELECTED_BORDER : 'var(--border-default)',
                }}
              />
            )}
          </div>
        )}
        {card.content.type === 'ghost' && (
          <button
            type="button"
            onClick={() => !isReadOnly && onPromote(card.id)}
            title={isReadOnly ? 'Not created yet' : 'Create this note'}
            className="flex w-full items-center justify-center p-5 text-center text-fg-faint hover:text-fg-prominent"
            style={{ fontSize: '0.9rem' }}
          >
            <HighlightedText text={card.content.title} words={searchWords} />
          </button>
        )}
      </div>
      {/* Opening is an explicit button, not a click on the card body, so a
          drag that ends over a note/PDF card can never open it. A text card
          without a title gets the same pill to add one. */}
      {(isLinkCard || isInline) && (
        <button
          type="button"
          tabIndex={isSelected && (isLinkCard || canAddTitle) ? 0 : -1}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => (card.content.type === 'inline' ? setIsAddingTitle(true) : 'path' in card.content && onNavigate(card.content.path))}
          // Always mounted so it can animate out as well as in: fades and
          // slides up from the card's edge on select, back down on deselect.
          className={`absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 rounded-full border bg-bg px-2.5 py-0.5 text-fg-muted transition-[opacity,transform] duration-panel ease-panel hover:text-fg-prominent ${
            isSelected && (isLinkCard || canAddTitle) ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0'
          }`}
          style={{ fontSize: '0.78rem', borderColor: 'var(--border-strong)' }}
        >
          {isInline ? 'Add title' : 'Open'}
        </button>
      )}
      {/* Arrow connector — hidden until the card is hovered. Drag from here
          onto another card to connect them (CanvasView.tsx owns the
          in-progress drag state); drop on empty space to name a new,
          not-yet-created note instead. */}
      {!isReadOnly && (
      <div
        title="Drag to connect to another card (or ⌘-drag from anywhere on a card)"
        className="absolute -bottom-1.5 -left-1.5 z-20 flex h-4 w-4 cursor-crosshair items-center justify-center rounded-full border bg-bg text-fg-faint opacity-0 transition-opacity duration-panel ease-panel group-hover:opacity-100"
        style={{ touchAction: 'none', borderColor: 'var(--border-strong)' }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onStartArrow(card.id, event);
        }}
      >
        <ArrowsOutCardinal size={9} />
      </div>
      )}
      {isImage && !isReadOnly && (
        <div
          title="Drag to resize"
          className="absolute -bottom-1.5 -right-1.5 z-20 h-3 w-3 cursor-nwse-resize rounded-sm border bg-bg opacity-0 transition-opacity duration-panel ease-panel group-hover:opacity-100"
          style={{ touchAction: 'none', borderColor: 'var(--border-strong)' }}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={() => (resizeOrigin.current = null)}
        />
      )}
    </div>
  );
}

/** Tab-card body (icon + clamped title + folder line), shared by note and PDF cards. */
export function LinkCardBody({ path, isPdf, isCanvas = false, words = [] }: { path: string; isPdf: boolean; isCanvas?: boolean; words?: readonly string[] }) {
  const Icon = isPdf ? FilePdf : isCanvas ? Stack : FileText;
  const folder = folderLabel(path);
  return (
    <div className="flex w-full flex-col gap-0.5 px-2.5 py-2 text-left text-fg-prominent">
      <span className="flex items-start gap-2">
        <Icon size={15} className={`shrink-0 ${isPdf ? 'text-accent-link-broken' : isCanvas ? 'text-accent-link' : ''}`} />
        <span className="min-w-0 flex-1 break-words font-medium" style={{ fontSize: '0.95rem', lineHeight: 1.4 }}>
          <HighlightedText text={fileTitle(path)} words={words} />
        </span>
      </span>
      {folder && (
        <span className="truncate pl-[23px] text-fg-faint" style={{ fontSize: '0.8rem' }}>
          <HighlightedText text={folder} words={words} />
        </span>
      )}
    </div>
  );
}
