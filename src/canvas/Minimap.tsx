import { useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasArrow, CanvasCard } from '../vault/canvasTypes';
import type { Point, Rect } from './canvasGeometry';
import { rectCenter } from './canvasGeometry';
import { layoutMinimap, unionRects } from './minimapGeometry';
import { PDF_CARD_BG } from './CanvasCard';
import { STICKY_CARD_BG, WARNING_CARD_BG } from './canvasConstants';

const MAP_WIDTH_PX = 200;
const MAP_HEIGHT_PX = 140;
const MAP_PADDING_PX = 10;
/** Screen px the minimap covers at the board's right edge (its width plus margin). */
export const MINIMAP_RIGHT_INSET_PX = MAP_WIDTH_PX + 16;
/** Cards never draw smaller than this, so a far-zoomed-out board stays visible. */
const MIN_CARD_PX = 2;
const STORAGE_KEY = 'auxin.canvas.minimap';

const CARD_FILL: Record<CanvasCard['content']['type'], string> = {
  inline: 'rgba(255, 255, 255, 0.28)',
  title: '#f2f1ee',
  sticky: STICKY_CARD_BG,
  warning: WARNING_CARD_BG,
  note: 'rgba(77, 200, 242, 0.55)',
  canvas: 'rgba(77, 200, 242, 0.55)',
  pdf: PDF_CARD_BG,
  image: 'rgba(171, 229, 101, 0.5)',
  ghost: 'rgba(255, 255, 255, 0.12)',
};

/** Whether the minimap is shown — one app-wide preference, kept across sessions. */
export function useMinimapOpen(): [boolean, () => void] {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  function toggle() {
    setIsOpen((open) => {
      try {
        localStorage.setItem(STORAGE_KEY, open ? 'off' : 'on');
      } catch {
        // Storage unavailable: the toggle still works for this session.
      }
      return !open;
    });
  }
  return [isOpen, toggle];
}

interface MinimapProps {
  cards: readonly CanvasCard[];
  arrows: readonly CanvasArrow[];
  arrowColor: string;
  /** The part of the board on screen right now, in world coordinates. */
  viewRect: Rect;
  /** Called with the world point under the pointer, while pressing or dragging. */
  onCenterOn: (world: Point) => void;
}

/** Overview of the whole board: every card as a small block, arrows as faint
 *  lines, and a frame for the visible area. Press or drag on it to move the
 *  view there. The map always spans the cards plus the visible area, so the
 *  frame never leaves it. */
export function Minimap({ cards, arrows, arrowColor, viewRect, onCenterOn }: MinimapProps) {
  const [isDragging, setIsDragging] = useState(false);
  const layout = layoutMinimap(unionRects([...cards, viewRect]), { w: MAP_WIDTH_PX, h: MAP_HEIGHT_PX }, MAP_PADDING_PX);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const frame = layout.toMapRect(viewRect);

  useEffect(() => {
    if (!isDragging) return;
    const stop = () => setIsDragging(false);
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, [isDragging]);

  function centerOnPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    onCenterOn(layout.toWorldPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top }));
  }

  return (
    <div
      className="pointer-events-auto absolute right-3 top-9 overflow-hidden border bg-bg-packet-card"
      style={{ width: MAP_WIDTH_PX, height: MAP_HEIGHT_PX, borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-float)' }}
      // Keep the board itself from panning, zooming or starting a marquee.
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <svg
        width={MAP_WIDTH_PX}
        height={MAP_HEIGHT_PX}
        className={isDragging ? 'cursor-grabbing' : 'cursor-pointer'}
        role="img"
        aria-label="Canvas overview — press or drag to move the view"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsDragging(true);
          centerOnPointer(event);
        }}
        onPointerMove={(event) => {
          if (isDragging) centerOnPointer(event);
        }}
      >
        {arrows.map((arrow) => {
          const from = cardsById.get(arrow.fromCardId);
          const to = cardsById.get(arrow.toCardId);
          if (!from || !to) return null;
          const a = layout.toMapPoint(rectCenter(from));
          const b = layout.toMapPoint(rectCenter(to));
          return <line key={arrow.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={arrowColor} strokeOpacity={0.45} strokeWidth={1} />;
        })}
        {cards.map((card) => {
          const r = layout.toMapRect(card);
          return (
            <rect
              key={card.id}
              x={r.x}
              y={r.y}
              width={Math.max(r.w, MIN_CARD_PX)}
              height={Math.max(r.h, MIN_CARD_PX)}
              fill={CARD_FILL[card.content.type]}
              rx={1}
            />
          );
        })}
        <rect
          x={frame.x}
          y={frame.y}
          width={frame.w}
          height={frame.h}
          fill="rgba(255, 255, 255, 0.06)"
          stroke="rgba(255, 255, 255, 0.7)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
