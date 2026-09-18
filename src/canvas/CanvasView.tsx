import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ulid } from 'ulid';
import { parseCanvasDocument } from '../vault/parseCanvas';
import { syncFile, toRelativePath } from '../vault/syncEngine';
import type { CanvasArrow as CanvasArrowData, CanvasCard as CanvasCardData, CanvasDocument } from '../vault/canvasTypes';
import { assignArrowLanes } from './arrowLanes';
import { findArrowCrossings } from './arrowCrossings';
import { buildArrowPath, computeArrowPolyline, crossbarShape, type CrossbarShape } from './arrowPath';
import { CanvasArrow, CanvasArrowDefs } from './CanvasArrow';
import { CanvasCard } from './CanvasCard';
import { ARROW_CORNER_RADIUS, DEFAULT_CARD_HEIGHT, DEFAULT_CARD_WIDTH, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from './canvasConstants';
import { offsetPosition, type NavDirection, type Point } from './canvasGeometry';
import { findOrCreateGhost } from './ghostCards';
import { NotePickerPopover } from './NotePickerPopover';
import { promoteCard } from './promoteCard';
import { useCanvasKeyboardNav } from './useCanvasKeyboardNav';

interface CanvasViewProps {
  path: string;
  vaultRoot: string;
  onNavigate: (relativePath: string) => void;
  /** Called after every autosave so App.tsx can refresh the note list /
   *  backlinks / unresolved-links panels — mirrors how `createNote`/
   *  `createHub` call `refreshNotes()` themselves right after `syncFile`. */
  onSynced: () => void;
}

const AUTOSAVE_DELAY_MS = 500;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface ArrowDraft {
  fromCardId: string;
  x: number;
  y: number;
}

interface TitlePrompt {
  fromCardId: string;
  x: number;
  y: number;
  value: string;
}

/** Top-level canvas board: loads/saves the `.axcanvas` JSON, owns pan/zoom
 *  and card/arrow state, and wires up keyboard navigation. Cards keep fixed,
 *  deliberately-placed positions (manual pointer-event drag, mirroring
 *  `StickyNoteCard.tsx`'s technique) — not the sticky board's d3-force
 *  auto-layout, which would fight a user's intentional spatial layout. */
export function CanvasView({ path, vaultRoot, onNavigate, onSynced }: CanvasViewProps) {
  const [doc, setDoc] = useState<CanvasDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  // Set once, right when a card is created via typing/Tab+direction, so that
  // one card's mini-editor grabs real DOM focus on mount — distinct from
  // `focusedCardId` (the board-level selection ring), which must never pull
  // DOM focus into a card's CodeMirror itself, or arrow-key board navigation
  // would stop working the moment a card became "focused".
  const [autoFocusCardId, setAutoFocusCardId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [arrowDraft, setArrowDraft] = useState<ArrowDraft | null>(null);
  const [titlePrompt, setTitlePrompt] = useState<TitlePrompt | null>(null);
  const [notePickerAnchor, setNotePickerAnchor] = useState<Point | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const addNoteButtonRef = useRef<HTMLButtonElement>(null);
  const docRef = useRef<CanvasDocument | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const relativePath = toRelativePath(vaultRoot, path);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const raw = await invoke<string>('read_note', { path });
        if (cancelled) return;
        setDoc(parseCanvasDocument(raw));
      } catch (error: unknown) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        const current = docRef.current;
        if (current) {
          void invoke('write_note', { path, content: JSON.stringify(current) }).then(() => syncFile(vaultRoot, path));
        }
      }
      setDoc(null);
      setFocusedCardId(null);
    };
  }, [path, vaultRoot]);

  function scheduleSave() {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      const current = docRef.current;
      if (!current) return;
      void invoke('write_note', { path, content: JSON.stringify(current) })
        .then(() => syncFile(vaultRoot, path))
        .then(onSynced);
    }, AUTOSAVE_DELAY_MS);
  }

  function updateDoc(updater: (doc: CanvasDocument) => CanvasDocument) {
    setDoc((prev) => (prev ? updater(prev) : prev));
    scheduleSave();
  }

  function screenToWorld(clientX: number, clientY: number): Point {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - panRef.current.y) / zoomRef.current,
    };
  }

  /** World-space point at the center of the current viewport — where
   *  `handleAddCard` and `handleInsertNoteCard` (both triggered by a
   *  toolbar click, not a positioned pointer event) drop a new card. */
  function viewportCenterWorld(): Point {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect ? { x: (rect.width / 2 - pan.x) / zoom, y: (rect.height / 2 - pan.y) / zoom } : { x: 0, y: 0 };
  }

  function handleChangeBody(cardId: string, body: string) {
    updateDoc((d) => ({
      ...d,
      cards: d.cards.map((c) => (c.id === cardId && c.content.type === 'inline' ? { ...c, content: { ...c.content, body } } : c)),
    }));
  }

  function handleMove(cardId: string, x: number, y: number) {
    updateDoc((d) => ({ ...d, cards: d.cards.map((c) => (c.id === cardId ? { ...c, x, y } : c)) }));
  }

  function handleResize(cardId: string, w: number, h: number) {
    updateDoc((d) => ({ ...d, cards: d.cards.map((c) => (c.id === cardId ? { ...c, w, h } : c)) }));
  }

  function handleDelete(cardId: string) {
    updateDoc((d) => ({
      ...d,
      cards: d.cards.filter((c) => c.id !== cardId),
      arrows: d.arrows.filter((a) => a.fromCardId !== cardId && a.toCardId !== cardId),
    }));
    setFocusedCardId((id) => (id === cardId ? null : id));
  }

  async function handlePromote(cardId: string) {
    const current = docRef.current;
    if (!current) return;
    const next = await promoteCard(vaultRoot, relativePath, current, cardId);
    setDoc(next);
    scheduleSave();
  }

  function handleCreateConnectedCard(fromCardId: string, direction: NavDirection) {
    const newCardId = ulid();
    updateDoc((d) => {
      const from = d.cards.find((c) => c.id === fromCardId);
      if (!from) return d;
      const pos = offsetPosition(from, direction);
      const newCard: CanvasCardData = {
        id: newCardId,
        x: pos.x,
        y: pos.y,
        w: DEFAULT_CARD_WIDTH,
        h: DEFAULT_CARD_HEIGHT,
        content: { type: 'inline', body: '' },
      };
      const newArrow: CanvasArrowData = { id: ulid(), fromCardId, toCardId: newCardId };
      return { ...d, cards: [...d.cards, newCard], arrows: [...d.arrows, newArrow] };
    });
    setFocusedCardId(newCardId);
    setAutoFocusCardId(newCardId);
  }

  function handleStartTyping(initialChar: string) {
    const newCardId = ulid();
    const rect = viewportRef.current?.getBoundingClientRect();
    const center = rect
      ? { x: (rect.width / 2 - panRef.current.x) / zoomRef.current, y: (rect.height / 2 - panRef.current.y) / zoomRef.current }
      : { x: 0, y: 0 };
    updateDoc((d) => ({
      ...d,
      cards: [
        ...d.cards,
        {
          id: newCardId,
          x: center.x - DEFAULT_CARD_WIDTH / 2,
          y: center.y - DEFAULT_CARD_HEIGHT / 2,
          w: DEFAULT_CARD_WIDTH,
          h: DEFAULT_CARD_HEIGHT,
          content: { type: 'inline', body: initialChar },
        },
      ],
    }));
    setFocusedCardId(newCardId);
    setAutoFocusCardId(newCardId);
  }

  useCanvasKeyboardNav({
    enabled: doc !== null,
    containerRef: viewportRef,
    cards: doc?.cards ?? [],
    focusedCardId,
    onFocusCard: setFocusedCardId,
    onDeleteCard: handleDelete,
    onCreateConnectedCard: handleCreateConnectedCard,
    onStartTyping: handleStartTyping,
  });

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldXBefore = (screenX - pan.x) / zoom;
    const worldYBefore = (screenY - pan.y) / zoom;
    const nextZoom = clamp(zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), MIN_ZOOM, MAX_ZOOM);
    setZoom(nextZoom);
    setPan({ x: screenX - worldXBefore * nextZoom, y: screenY - worldYBefore * nextZoom });
  }

  /** A card's root wrapper and this background both call `focusCard` on
   *  pointerdown — neither is a naturally-focusable element (a plain `div`,
   *  unlike the promote/note/ghost `<button>`s, which already get real DOM
   *  focus from the click itself), so without this, clicking one after
   *  something outside the board previously had focus (a sidebar button)
   *  would leave `document.activeElement` unchanged — `isWithinBoard()`
   *  (`useCanvasKeyboardNav.ts`) would then wrongly treat the very click
   *  that just selected a card as still "outside the board" and ignore the
   *  arrow key that follows it. `viewportRef` itself is `tabIndex={-1}` so
   *  it can receive this programmatic focus. */
  function focusCard(cardId: string | null) {
    setFocusedCardId(cardId);
    viewportRef.current?.focus();
  }

  function handleBackgroundPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    focusCard(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
  }

  function handleBackgroundPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    dragState.current = { ...drag, lastX: event.clientX, lastY: event.clientY };
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }

  function handleBackgroundPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
  }

  function handleStartArrow(fromCardId: string, event: ReactPointerEvent) {
    const world = screenToWorld(event.clientX, event.clientY);
    setArrowDraft({ fromCardId, x: world.x, y: world.y });

    function handleMove(moveEvent: PointerEvent) {
      const w = screenToWorld(moveEvent.clientX, moveEvent.clientY);
      setArrowDraft((draft) => (draft ? { ...draft, x: w.x, y: w.y } : draft));
    }

    function handleUp(upEvent: PointerEvent) {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setArrowDraft(null);

      const targetEl = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      const targetCardEl = targetEl instanceof Element ? targetEl.closest('[data-canvas-card-id]') : null;
      const targetCardId = targetCardEl?.getAttribute('data-canvas-card-id') ?? null;

      if (targetCardId && targetCardId !== fromCardId) {
        updateDoc((d) => ({ ...d, arrows: [...d.arrows, { id: ulid(), fromCardId, toCardId: targetCardId }] }));
        return;
      }
      if (!targetCardId) {
        const worldPoint = screenToWorld(upEvent.clientX, upEvent.clientY);
        setTitlePrompt({ fromCardId, x: worldPoint.x, y: worldPoint.y, value: '' });
      }
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  function commitTitlePrompt() {
    // Reads/clears via the functional updater rather than the closed-over
    // `titlePrompt` value — Enter commits and unmounts the input, and an
    // element removed from the DOM while focused can fire a native blur
    // right after, which would call this a second time from a stale
    // closure. Atomically consuming the state here makes a second call a
    // no-op (`current` is already null) instead of creating a duplicate
    // ghost/arrow.
    setTitlePrompt((current) => {
      if (!current) return current;
      const title = current.value.trim();
      if (title) {
        const { fromCardId, x, y } = current;
        updateDoc((d) => {
          const { doc: withGhost, cardId: ghostId } = findOrCreateGhost(d, title, { x, y });
          return { ...withGhost, arrows: [...withGhost.arrows, { id: ulid(), fromCardId, toCardId: ghostId }] };
        });
      }
      return null;
    });
  }

  function handleAddCard() {
    const newCardId = ulid();
    const center = viewportCenterWorld();
    updateDoc((d) => ({
      ...d,
      cards: [
        ...d.cards,
        {
          id: newCardId,
          x: center.x - DEFAULT_CARD_WIDTH / 2,
          y: center.y - DEFAULT_CARD_HEIGHT / 2,
          w: DEFAULT_CARD_WIDTH,
          h: DEFAULT_CARD_HEIGHT,
          content: { type: 'inline', body: '' },
        },
      ],
    }));
    setFocusedCardId(newCardId);
    setAutoFocusCardId(newCardId);
  }

  function handleOpenNotePicker() {
    const rect = addNoteButtonRef.current?.getBoundingClientRect();
    setNotePickerAnchor(rect ? { x: rect.left, y: rect.bottom + 4 } : { x: 12, y: 32 });
  }

  /** Drops an existing note onto the board as a `{type: 'note', path}` card
   *  — the reverse of `promoteCard.ts` (writes nothing new to disk). If that
   *  note is already placed on this board, focuses the existing card instead
   *  of adding a duplicate — the same dedup call `findOrCreateGhost` makes
   *  for not-yet-created titles. */
  function handleInsertNoteCard(path: string) {
    const current = docRef.current;
    if (!current) return;
    const existing = current.cards.find((c) => c.content.type === 'note' && c.content.path === path);
    if (existing) {
      focusCard(existing.id);
      return;
    }

    const newCardId = ulid();
    const center = viewportCenterWorld();
    updateDoc((d) => ({
      ...d,
      cards: [
        ...d.cards,
        {
          id: newCardId,
          x: center.x - DEFAULT_CARD_WIDTH / 2,
          y: center.y - DEFAULT_CARD_HEIGHT / 2,
          w: DEFAULT_CARD_WIDTH,
          h: DEFAULT_CARD_HEIGHT,
          content: { type: 'note', path },
        },
      ],
    }));
    focusCard(newCardId);
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center text-fg-faint" style={{ fontSize: '0.78rem' }}>
        failed to load canvas: {loadError}
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center text-fg-faint" style={{ fontSize: '0.78rem' }}>
        loading canvas…
      </div>
    );
  }

  const cardsById = new Map(doc.cards.map((card) => [card.id, card]));
  const fromCardForDraft = arrowDraft ? cardsById.get(arrowDraft.fromCardId) : null;
  // Same orthogonal router CanvasArrow.tsx's routes use for a committed
  // arrow, aimed at a zero-size box under the cursor — keeps the
  // in-progress dashed preview exiting from the same boundary point (and
  // elbow shape) the real arrow will land on once it's dropped onto a
  // target card. No hop bumps against committed arrows: a transient,
  // single in-flight preview crossing a real arrow isn't worth the extra
  // crossing-detection pass for how briefly it's visible.
  const draftArrowRoute =
    arrowDraft && fromCardForDraft
      ? buildArrowPath(
          computeArrowPolyline(fromCardForDraft, { x: arrowDraft.x, y: arrowDraft.y, w: 0, h: 0 }, 0),
          ARROW_CORNER_RADIUS,
          [],
        )
      : null;

  // Three passes, each needing every arrow's info from the previous one
  // before any single arrow's final path can be built: (1) each arrow's
  // natural, unoffset crossbar shape, so (2) `assignArrowLanes` can find
  // which arrows would otherwise run parallel through the same corridor and
  // space them apart deterministically, before (3) `findArrowCrossings`
  // checks the (now laned) polylines for genuine perpendicular crossings.
  const baseShapes = new Map<string, CrossbarShape>();
  for (const arrow of doc.arrows) {
    const fromCard = cardsById.get(arrow.fromCardId);
    const toCard = cardsById.get(arrow.toCardId);
    if (!fromCard || !toCard) continue;
    baseShapes.set(arrow.id, crossbarShape(computeArrowPolyline(fromCard, toCard, 0)));
  }
  const laneOffsets = assignArrowLanes(baseShapes);

  const arrowPolylines = new Map<string, Point[]>();
  for (const arrow of doc.arrows) {
    const fromCard = cardsById.get(arrow.fromCardId);
    const toCard = cardsById.get(arrow.toCardId);
    if (!fromCard || !toCard) continue;
    arrowPolylines.set(arrow.id, computeArrowPolyline(fromCard, toCard, laneOffsets.get(arrow.id) ?? 0));
  }
  const hopsByArrowId = findArrowCrossings(arrowPolylines);

  return (
    <div
      ref={viewportRef}
      // Programmatically focusable only (-1 keeps it out of natural Tab
      // order, which this board's own Tab+direction chord already repurposes)
      // — see `focusCard`'s doc comment above for why it needs to be.
      tabIndex={-1}
      className="relative h-full w-full touch-none select-none overflow-hidden outline-none"
      onWheel={handleWheel}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handleBackgroundPointerMove}
      onPointerUp={handleBackgroundPointerUp}
      onPointerLeave={handleBackgroundPointerUp}
    >
      <div
        className="absolute left-0 top-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
      >
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={0} height={0}>
          <CanvasArrowDefs />
          {doc.arrows.map((arrow) => {
            const polyline = arrowPolylines.get(arrow.id);
            if (!polyline) return null;
            const route = buildArrowPath(polyline, ARROW_CORNER_RADIUS, hopsByArrowId.get(arrow.id) ?? []);
            return <CanvasArrow key={arrow.id} route={route} label={arrow.label} />;
          })}
          {draftArrowRoute && (
            <path d={draftArrowRoute.path} fill="none" stroke="var(--fg-faint)" strokeWidth={2} strokeDasharray="4 4" />
          )}
        </svg>
        {doc.cards.map((card) => (
          <CanvasCard
            key={card.id}
            card={card}
            vaultRoot={vaultRoot}
            zoom={zoom}
            isFocused={card.id === focusedCardId}
            onNavigate={onNavigate}
            onChangeBody={handleChangeBody}
            onMove={handleMove}
            onResize={handleResize}
            onPromote={(cardId) => void handlePromote(cardId)}
            onDelete={handleDelete}
            onFocus={focusCard}
            onStartArrow={handleStartArrow}
            autoFocus={card.id === autoFocusCardId}
          />
        ))}
        {titlePrompt && (
          <input
            autoFocus
            value={titlePrompt.value}
            onChange={(event) => setTitlePrompt((prev) => (prev ? { ...prev, value: event.target.value } : prev))}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') commitTitlePrompt();
              if (event.key === 'Escape') setTitlePrompt(null);
            }}
            onBlur={commitTitlePrompt}
            placeholder="note title…"
            className="absolute border border-border-strong bg-bg px-1.5 py-1 text-fg-prominent outline-none"
            style={{ left: titlePrompt.x, top: titlePrompt.y, width: DEFAULT_CARD_WIDTH, fontSize: '0.8rem' }}
          />
        )}
      </div>
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-3">
        <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
          [canvas]
        </span>
        <button
          type="button"
          onClick={handleAddCard}
          className="pointer-events-auto text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
          style={{ fontSize: '0.68rem' }}
        >
          [+ card]
        </button>
        <button
          type="button"
          ref={addNoteButtonRef}
          onClick={handleOpenNotePicker}
          className="pointer-events-auto text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
          style={{ fontSize: '0.68rem' }}
        >
          [+ note]
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="pointer-events-auto text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
          style={{ fontSize: '0.68rem' }}
        >
          [reset view]
        </button>
      </div>
      {notePickerAnchor && (
        <NotePickerPopover
          vaultRoot={vaultRoot}
          x={notePickerAnchor.x}
          y={notePickerAnchor.y}
          onSelect={(path) => {
            handleInsertNoteCard(path);
            setNotePickerAnchor(null);
          }}
          onClose={() => setNotePickerAnchor(null)}
        />
      )}
    </div>
  );
}
