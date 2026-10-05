import { useEffect, useRef, useState } from 'react';
import { useStickyStore } from './stickyStore';
import { useStickyBoardLayout } from './useStickyBoardLayout';
import { StickyNoteCard } from './StickyNoteCard';

interface ContainerSize {
  width: number;
  height: number;
}

/**
 * Full-screen "fridge door" — every note drifts in an organic cluster via
 * `useStickyBoardLayout`'s live physics, draggable to reposition.
 */
export function StickyBoard() {
  const notes = useStickyStore((state) => state.notes);
  const layout = useStickyBoardLayout(notes);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ContainerSize>({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The simulation is centered at sim-space (0, 0) — the board's own visual
  // center is wherever this container happens to sit, so every coordinate
  // crossing that boundary needs this same offset applied or removed.
  const offsetX = size.width / 2;
  const offsetY = size.height / 2;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-bg">
      {notes.map((note) => {
        const simPosition = layout.positions.get(note.id) ?? { x: 0, y: 0 };
        return (
          <StickyNoteCard
            key={note.id}
            note={note}
            position={{ x: offsetX + simPosition.x, y: offsetY + simPosition.y }}
            onBeginDrag={layout.beginDrag}
            onDragTo={(id, screenX, screenY) => layout.dragTo(id, screenX - offsetX, screenY - offsetY)}
            onEndDrag={layout.endDrag}
          />
        );
      })}
    </div>
  );
}
