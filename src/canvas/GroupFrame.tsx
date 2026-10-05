import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasGroup } from '../vault/canvasTypes';
import { GROUP_HEADER_H } from './canvasConstants';
import type { Rect } from './canvasGeometry';

const GROUP_RADIUS_PX = 14;
/** The title tab: a flat block of the accent color, with dark text like the board's other black-on-color cards. */
const TAB_BACKGROUND = 'var(--accent-link)';
const TAB_TEXT_STYLE = { fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.35 } as const;
const GROUP_TAB_H = 30;

interface GroupFrameProps {
  group: CanvasGroup;
  frame: Rect;
  /** All of its cards are selected. */
  isSelected: boolean;
  /** A card being dragged would join it if dropped now. */
  isDropTarget: boolean;
  zoom: number;
  /** `isAdditive`: ⇧ was held, so the group's cards join the selection instead of replacing it. */
  onDragStart: (groupId: string, isAdditive: boolean) => void;
  /** Total world-space delta since `onDragStart`. */
  onMoveBy: (groupId: string, dx: number, dy: number, isAxisLocked: boolean) => void;
  /** The strip was released after actually moving the group. */
  onDragEnd: (groupId: string) => void;
  onRename: (groupId: string, label: string) => void;
  /** Too small on screen to read: shows just its title and card count over its contents. */
  isSummarized: boolean;
  cardCount: number;
  /** Double-click on the summary: zoom in to the group. */
  onZoomTo: (groupId: string) => void;
  /** Reading mode: the group can be selected but not moved or renamed. */
  isReadOnly: boolean;
}

interface PointerOrigin {
  pointerId: number;
  clientX: number;
  clientY: number;
  moved: boolean;
}

/** A labeled frame around a group's cards, behind them. Only its title strip takes the
 *  pointer; the body is click-through, so cards, marquee-select and
 *  the background menu all keep working inside it. */
export function GroupFrame({ group, frame, isSelected, isDropTarget, zoom, onDragStart, onMoveBy, onDragEnd, onRename, isSummarized, cardCount, onZoomTo, isReadOnly }: GroupFrameProps) {
  const drag = useRef<PointerOrigin | null>(null);

  function begin(ref: typeof drag, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return false;
    event.currentTarget.setPointerCapture(event.pointerId);
    ref.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, moved: false };
    return true;
  }

  function delta(origin: PointerOrigin, event: ReactPointerEvent<HTMLElement>) {
    return { dx: (event.clientX - origin.clientX) / zoom, dy: (event.clientY - origin.clientY) / zoom };
  }

  const stripHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      event.stopPropagation();
      if (begin(drag, event)) onDragStart(group.id, event.shiftKey);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (drag.current?.pointerId !== event.pointerId || isReadOnly) return;
      drag.current.moved = true;
      const { dx, dy } = delta(drag.current, event);
      onMoveBy(group.id, dx, dy, event.shiftKey);
    },
    onPointerUp: () => {
      if (drag.current?.moved) onDragEnd(group.id);
      drag.current = null;
    },
  };

  const edge = isSelected || isDropTarget ? 'var(--accent-link)' : 'color-mix(in srgb, var(--accent-link) 32%, transparent)';
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
    >
      {/* The frame's top band holds the title tab; the body starts below it. */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          top: GROUP_HEADER_H,
          borderRadius: GROUP_RADIUS_PX,
          borderTopLeftRadius: 0,
          border: `1px solid ${edge}`,
          background: `color-mix(in srgb, var(--accent-link) ${isDropTarget ? 14 : 7}%, transparent)`,
        }}
      />
      {!isSummarized && (
        <div
          data-canvas-group-id={group.id}
          className={`pointer-events-auto absolute left-0 flex max-w-full items-center px-3 ${isReadOnly ? '' : 'cursor-grab active:cursor-grabbing'}`}
          style={{
            top: GROUP_HEADER_H - GROUP_TAB_H,
            height: GROUP_TAB_H,
            background: TAB_BACKGROUND,
          }}
          {...stripHandlers}
        >
          {/* A hidden copy of the name sets the tab's width; the input sits over it in the same grid cell. */}
          <span className="relative inline-grid max-w-full">
            <span aria-hidden className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre" style={TAB_TEXT_STYLE}>
              {group.label || 'group'}
            </span>
            <input
              value={group.label}
              placeholder="group"
              readOnly={isReadOnly}
              onChange={(event) => onRename(group.id, event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
              }}
              className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-black outline-none placeholder:text-black/40"
              style={TAB_TEXT_STYLE}
            />
          </span>
        </div>
      )}
      {isSummarized && (
        // Above the cards (z-30 climbs out of this unstyled wrapper), hiding
        // them, and just as draggable as the title strip.
        <div
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex cursor-grab flex-col items-center justify-center overflow-hidden text-center active:cursor-grabbing"
          style={{
            top: GROUP_HEADER_H,
            borderRadius: GROUP_RADIUS_PX,
            borderTopLeftRadius: 0,
            background: 'color-mix(in srgb, var(--accent-link) 16%, var(--color-bg))',
            padding: 16 / zoom,
            gap: 4 / zoom,
          }}
          onDoubleClick={() => onZoomTo(group.id)}
          {...stripHandlers}
        >
          <span className="max-w-full truncate text-fg-prominent" style={{ fontSize: 20 / zoom, fontWeight: 700 }}>
            {group.label || 'group'}
          </span>
          <span className="text-fg-faint" style={{ fontSize: 12 / zoom }}>
            {cardCount} {cardCount === 1 ? 'card' : 'cards'}
          </span>
        </div>
      )}
    </div>
  );
}
