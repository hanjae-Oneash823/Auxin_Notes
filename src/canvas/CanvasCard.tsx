import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowsOutCardinal, FileText, TrashSimple } from '@phosphor-icons/react';
import type { CanvasCard as CanvasCardData } from '../vault/canvasTypes';
import { CardTextEditor } from './CardTextEditor';
import { DRAG_CLICK_THRESHOLD_PX, MIN_CARD_HEIGHT, MIN_CARD_WIDTH } from './canvasConstants';

interface CanvasCardProps {
  card: CanvasCardData;
  vaultRoot: string;
  zoom: number;
  isSelected: boolean;
  onNavigate: (path: string) => void;
  onChangeBody: (cardId: string, body: string) => void;
  /** Total world-space delta since drag-start, not an absolute position —
   *  lets CanvasView.tsx apply the same dx/dy to every card in a multi-card
   *  selection for a rigid group drag. */
  onMoveBy: (cardId: string, dx: number, dy: number) => void;
  onResize: (cardId: string, w: number, h: number) => void;
  onPromote: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onFocus: (cardId: string) => void;
  /** Fires when the drag strip's pointer is released — `moved` is false for
   *  a plain click (pointer never traveled past `DRAG_CLICK_THRESHOLD_PX`),
   *  which CanvasView.tsx uses to narrow a multi-selection down to just this
   *  card rather than leaving the whole group selected. */
  onDragEnd: (cardId: string, moved: boolean) => void;
  /** Arrow-drawing: mousedown on the connector handle starts a drag that
   *  CanvasView.tsx tracks; released over another card, it creates an arrow. */
  onStartArrow: (cardId: string, event: ReactPointerEvent) => void;
  /** True only for the one card just created via typing/Tab+direction — see
   *  CanvasView.tsx's `autoFocusCardId` doc comment for why this is kept
   *  separate from `isSelected`. */
  autoFocus: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** A card's chrome (drag strip, delete/promote, resize handle, connector) is
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
  onNavigate,
  onChangeBody,
  onMoveBy,
  onResize,
  onPromote,
  onDelete,
  onFocus,
  onDragEnd,
  onStartArrow,
  autoFocus,
}: CanvasCardProps) {
  const dragOrigin = useRef<{ pointerId: number; startClientX: number; startClientY: number; moved: boolean } | null>(null);
  const resizeOrigin = useRef<{ pointerId: number; startClientX: number; startClientY: number; w: number; h: number } | null>(
    null,
  );

  function handleDragPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    onFocus(card.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
  }

  function handleDragPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragOrigin.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // Screen-pixel deltas need dividing by the board's zoom to land back in
    // world (card x/y) units — the same conversion Graph2DPanel.tsx's
    // drag-pan does for its own zoomed viewBox.
    const dx = (event.clientX - drag.startClientX) / zoom;
    const dy = (event.clientY - drag.startClientY) / zoom;
    const traveled = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
    dragOrigin.current = { ...drag, moved: drag.moved || traveled > DRAG_CLICK_THRESHOLD_PX };
    onMoveBy(card.id, dx, dy);
  }

  function handleDragPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragOrigin.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragOrigin.current = null;
    onDragEnd(card.id, drag.moved);
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeOrigin.current = { pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, w: card.w, h: card.h };
  }

  function handleResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = resizeOrigin.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const dx = (event.clientX - resize.startClientX) / zoom;
    const dy = (event.clientY - resize.startClientY) / zoom;
    onResize(card.id, clamp(resize.w + dx, MIN_CARD_WIDTH, Infinity), clamp(resize.h + dy, MIN_CARD_HEIGHT, Infinity));
  }

  function handleResizePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (resizeOrigin.current?.pointerId === event.pointerId) resizeOrigin.current = null;
  }

  const isNote = card.content.type === 'note';
  const isGhost = card.content.type === 'ghost';

  return (
    <div
      className="group absolute flex flex-col border bg-bg"
      data-canvas-card-id={card.id}
      style={{
        left: card.x,
        top: card.y,
        width: card.w,
        height: card.h,
        borderColor: isSelected ? 'var(--accent-link)' : isNote ? 'var(--accent-link)' : isGhost ? 'var(--border)' : 'var(--border)',
        borderWidth: isSelected ? 2 : 1,
        borderStyle: isGhost ? 'dashed' : 'solid',
        borderLeftWidth: isNote ? 3 : isSelected ? 2 : 1,
        // Hand-duplicated RGB of --accent-link (tokens.css) — this alpha-
        // composited string can't be built from var() the way a plain
        // color property can.
        backgroundColor: isNote ? 'rgba(77, 200, 242, 0.05)' : undefined,
        opacity: isGhost ? 0.55 : 1,
        boxShadow: isSelected ? '0 0 0 1px var(--accent-link)' : undefined,
      }}
      onPointerDown={() => onFocus(card.id)}
    >
      {/* Thin, unlabeled drag strip — hover shows a faint grip cue rather
          than a permanent title bar. Buttons float over it, hidden until
          the card is hovered/focused. */}
      <div
        className="absolute left-0 right-0 top-0 z-10 h-3.5 cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
      />
      <div className="pointer-events-none absolute right-1 top-1 z-20 flex items-center gap-1 opacity-0 transition-opacity duration-panel ease-panel group-hover:opacity-100">
        {card.content.type === 'inline' && card.content.body.trim().length > 0 && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onPromote(card.id)}
            title="Promote to standalone note"
            className="pointer-events-auto text-fg-faint hover:text-fg-prominent"
            style={{ fontSize: '0.62rem' }}
          >
            [promote]
          </button>
        )}
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
      <div className="min-h-0 flex-1 overflow-hidden pt-3.5">
        {card.content.type === 'inline' && (
          <CardTextEditor
            vaultRoot={vaultRoot}
            value={card.content.body}
            onChange={(body) => onChangeBody(card.id, body)}
            onNavigate={onNavigate}
            readOnly={false}
            autoFocus={autoFocus}
          />
        )}
        {card.content.type === 'note' && (
          <button
            type="button"
            onClick={() => onNavigate(card.content.type === 'note' ? card.content.path : '')}
            className="flex h-full w-full flex-col items-start gap-1 p-2.5 text-left hover:opacity-80"
          >
            <FileText size={14} weight="bold" style={{ color: 'var(--accent-link)' }} />
            <span className="font-semibold text-fg-prominent" style={{ fontSize: '0.88rem', lineHeight: 1.25 }}>
              {card.content.path.split('/').pop()?.replace(/\.md$/, '')}
            </span>
          </button>
        )}
        {card.content.type === 'ghost' && (
          <button
            type="button"
            onClick={() => onPromote(card.id)}
            title="Create this note"
            className="flex h-full w-full items-center justify-center p-2 text-center text-fg-faint hover:text-fg-prominent"
            style={{ fontSize: '0.8rem' }}
          >
            {card.content.title}
          </button>
        )}
      </div>
      {/* Arrow connector — visible-but-quiet at rest (not opacity-0) so it's
          actually discoverable; brightens further on hover. Drag from here
          onto another card to connect them (CanvasView.tsx owns the
          in-progress drag state); drop on empty space to name a new,
          not-yet-created note instead. */}
      <div
        title="Drag to connect to another card"
        className="absolute -bottom-1.5 -left-1.5 z-20 flex h-4 w-4 cursor-crosshair items-center justify-center rounded-full border bg-bg text-fg-faint opacity-40 transition-opacity duration-panel ease-panel hover:opacity-100"
        style={{ touchAction: 'none', borderColor: 'var(--border-strong)' }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onStartArrow(card.id, event);
        }}
      >
        <ArrowsOutCardinal size={9} />
      </div>
      <div
        className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize"
        style={{ touchAction: 'none' }}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
      />
    </div>
  );
}
