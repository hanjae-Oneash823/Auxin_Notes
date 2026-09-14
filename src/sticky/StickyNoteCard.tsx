import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { PushPin, X } from '@phosphor-icons/react';
import type { StickyNote } from '../db/queries/sticky';
import { useStickyStore } from './stickyStore';

export const CARD_WIDTH = 180;
const DRAG_THRESHOLD_PX = 4;

interface StickyNoteCardProps {
  note: StickyNote;
  /** Board-space center position (physics board only) — omitted in the
   *  pinned dock, which lays notes out in normal document flow instead. */
  position?: { x: number; y: number };
  onBeginDrag?: (id: string) => void;
  onDragTo?: (id: string, x: number, y: number) => void;
  onEndDrag?: (id: string) => void;
}

interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

/** Stable per-note tilt so the board doesn't reshuffle rotation on every
 *  render — small enough to read as "someone dropped this here," not enough
 *  to make the text hard to read. */
function rotationForId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 800) / 100) - 4; // -4deg .. 4deg
}

export function StickyNoteCard({ note, position, onBeginDrag, onDragTo, onEndDrag }: StickyNoteCardProps) {
  const update = useStickyStore((state) => state.update);
  const remove = useStickyStore((state) => state.remove);
  const setPinned = useStickyStore((state) => state.setPinned);
  const toggleChecklistItem = useStickyStore((state) => state.toggleChecklistItem);
  const updateChecklistItemText = useStickyStore((state) => state.updateChecklistItemText);
  const removeChecklistItem = useStickyStore((state) => state.removeChecklistItem);
  const addChecklistItem = useStickyStore((state) => state.addChecklistItem);

  const [content, setContent] = useState(note.content);
  const [newItemText, setNewItemText] = useState('');
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => setContent(note.content), [note.content]);

  const rotation = rotationForId(note.id);
  const isDraggable = position !== undefined;

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggable || !onBeginDrag) return;
    const target = event.target as HTMLElement;
    if (target.closest('textarea, input, button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y };
    onBeginDrag(note.id);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !onDragTo) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
    onDragTo(note.id, drag.originX + dx, drag.originY + dy);
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !onEndDrag) return;
    onEndDrag(note.id);
  }

  function commitContent() {
    if (content !== note.content) void update(note.id, { content });
  }

  function commitNewItem() {
    const text = newItemText.trim();
    if (!text) return;
    void addChecklistItem(note.id, text);
    setNewItemText('');
  }

  const style: CSSProperties = {
    width: CARD_WIDTH,
    background: `var(--sticky-${note.color}-bg)`,
    borderColor: `var(--sticky-${note.color}-border)`,
    color: 'var(--sticky-ink)',
    boxShadow: 'var(--sticky-shadow)',
    transform: `rotate(${rotation}deg)`,
    touchAction: 'none',
  };
  if (position) {
    style.position = 'absolute';
    style.left = position.x - CARD_WIDTH / 2;
    style.top = position.y - CARD_WIDTH / 2;
  }

  return (
    <div
      className="rounded-sticky border p-2.5"
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="mb-1 flex justify-end gap-1 opacity-70">
        <button type="button" title={note.pinned ? 'unpin' : 'pin'} onClick={() => void setPinned(note.id, !note.pinned)}>
          <PushPin size={14} weight={note.pinned ? 'fill' : 'regular'} />
        </button>
        <button type="button" title="delete" onClick={() => void remove(note.id)}>
          <X size={14} weight="regular" />
        </button>
      </div>

      {note.type === 'checklist' ? (
        <div className="flex flex-col gap-1" style={{ fontSize: '0.8rem' }}>
          {note.items.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(event) => void toggleChecklistItem(note.id, item.id, event.target.checked)}
              />
              <input
                value={item.text}
                onChange={(event) => void updateChecklistItemText(note.id, item.id, event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
                style={{ textDecoration: item.checked ? 'line-through' : 'none', opacity: item.checked ? 0.55 : 1 }}
              />
              <button type="button" onClick={() => void removeChecklistItem(note.id, item.id)} className="opacity-50 hover:opacity-100">
                <X size={11} weight="regular" />
              </button>
            </div>
          ))}
          <input
            value={newItemText}
            onChange={(event) => setNewItemText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitNewItem();
            }}
            onBlur={commitNewItem}
            placeholder="+ add item"
            className="bg-transparent outline-none"
            style={{ opacity: 0.6 }}
          />
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onBlur={commitContent}
          rows={4}
          className="w-full resize-none bg-transparent outline-none"
          style={{ fontSize: '0.8rem' }}
        />
      )}
    </div>
  );
}
