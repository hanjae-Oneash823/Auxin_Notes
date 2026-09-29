import { useEffect, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { message } from '@tauri-apps/plugin-dialog';
import { ulid } from 'ulid';
import { parseCanvasDocument } from '../vault/parseCanvas';
import { syncFile, toRelativePath } from '../vault/syncEngine';
import type { CanvasArrow as CanvasArrowData, CanvasCard as CanvasCardData, CanvasDocument } from '../vault/canvasTypes';
import { exitPoint } from './arrowGeometry';
import { layoutArrowLabel } from './arrowLabelLayout';
import { buildArrowPath } from './arrowPath';
import { useArrowRoutes } from './useArrowRoutes';
import { CanvasArrow, CanvasArrowDefs } from './CanvasArrow';
import { CanvasCard } from './CanvasCard';
import { ContextMenu, type ContextMenuItem } from '../layout/ContextMenu';
import { buildArrowMenu, buildBackgroundMenu, buildCardMenu } from './canvasContextMenu';
import {
  ARROW_COLOR,
  ARROW_LABEL_INPUT_WIDTH,
  ARROW_CORNER_RADIUS,
  ARROW_STROKE_PX,
  DEFAULT_CARD_HEIGHT,
  DEFAULT_CARD_WIDTH,
  DRAG_CLICK_THRESHOLD_PX,
  DUPLICATE_OFFSET_PX,
  IMAGE_CARD_WIDTH,
  IMAGE_STAGGER_PX,
  FIT_PADDING_PX,
  TOOLBAR_INSET_PX,
  MAX_ZOOM,
  VIEW_ANIMATION_MS,
  MIN_ZOOM,
  ZOOM_STEP,
  OPTIMIZE_ANIMATION_MS,
  OPTIMIZE_PASSES,
  ROTATE_STEP_DEGREES,
} from './canvasConstants';
import { offsetPosition, rectsIntersect, type NavDirection, type Point, type Rect } from './canvasGeometry';
import { imageFilesFrom, pickAndCopyImages, saveImageFile } from './canvasImages';
import { findOrCreateGhost } from './ghostCards';
import { flipPositions, type FlipAxis } from './flipLayout';
import { LayoutToolbar } from './LayoutToolbar';
import { NewToolbar } from './NewToolbar';
import { ArrowColorPicker } from './ArrowColorPicker';
import { CARD_CLIPBOARD_MARKER, cloneCards, copyToCardClipboard, isCopyableCard, takeCardClipboard } from './cardClipboard';
import { CANVAS_DRAG_EVENT, CANVAS_DROP_EVENT, CANVAS_DROP_ID, type CanvasDragDetail, type CanvasDropDetail } from './canvasDrop';
import { DropPreviewCard } from './DropPreviewCard';
import { EditToolbar } from './EditToolbar';
import { ExportToolbar } from './ExportToolbar';
import { exportBoardAsImage, pickImageExportPath } from './exportImage';
import { useCanvasHistory, type HistoryMode } from './useCanvasHistory';
import { getSavedView, saveView } from './canvasViewStore';
import { useIsMetaHeld } from './useIsMetaHeld';
import { ToolbarShell } from './ToolbarShell';
import { ViewToolbar } from './ViewToolbar';
import { boundsOfCards, shiftToDefaultViewCenter, viewFittingRect, type ViewState } from './viewTransforms';
import { optimizeLayout } from './optimizeLayout';
import { rotatePositions } from './rotateLayout';
import { NotePickerPopover } from './NotePickerPopover';
import { promoteCard } from './promoteCard';
import { useCanvasKeyboardNav } from './useCanvasKeyboardNav';

/** Resolves after React has committed and the browser has painted the state just set. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** True when the event's target is somewhere the user types (a card's editor,
 *  the terminal, any input) — keyboard and clipboard shortcuts leave those alone. */
function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, [contenteditable="true"], .cm-editor') !== null;
}

interface ArrowLabelEdit {
  arrowId: string;
  /** World coordinates of the label's anchor on the arrow. */
  x: number;
  y: number;
  value: string;
}

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

interface OpenMenu {
  /** Distinguishes a menu from the one it replaced — a closing menu's delayed
   *  `onClose` must not tear down the menu opened right after it. */
  id: number;
  x: number;
  y: number;
  items: ContextMenuItem[];
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
  // Cards currently highlighted for group actions (drag together, delete
  // together) — a PureRef-style marquee selection. `focusedCardId` remains
  // the single keyboard-nav anchor; this tracks the (possibly larger) set a
  // marquee, click, or group drag/delete should act on.
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  // Set once, right when a card is created via typing/Tab+direction, so that
  // one card's mini-editor grabs real DOM focus on mount — distinct from
  // `focusedCardId` (the board-level selection ring), which must never pull
  // DOM focus into a card's CodeMirror itself, or arrow-key board navigation
  // would stop working the moment a card became "focused".
  const [autoFocusCardId, setAutoFocusCardId] = useState<string | null>(null);
  // The one card whose text is live (editable, selectable) — entered by a
  // plain click on a card, or by creating one. Every other card's text is
  // inert so the whole card can be dragged.
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const isMetaHeld = useIsMetaHeld();
  // Start from this canvas's last view this session, if it had one.
  const [savedView] = useState(() => getSavedView(path));
  const [zoom, setZoom] = useState(savedView?.zoom ?? 1);
  const [pan, setPan] = useState<Point>(savedView?.pan ?? { x: 0, y: 0 });
  useEffect(() => {
    saveView(path, { zoom, pan });
  }, [path, zoom, pan]);
  const [arrowDraft, setArrowDraft] = useState<ArrowDraft | null>(null);
  // Screen-space (viewport-relative) marquee-select overlay rect, live while
  // a left-button drag is in progress on the bare background.
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [titlePrompt, setTitlePrompt] = useState<TitlePrompt | null>(null);
  const [notePickerAnchor, setNotePickerAnchor] = useState<Point | null>(null);
  const optimizeFrameRef = useRef<number | null>(null);
  /** Which pass ("1"–"4") an optimize run is on, or null when idle. */
  const [optimizePass, setOptimizePass] = useState<number | null>(null);
  const isUnmountedRef = useRef(false);
  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      if (optimizeFrameRef.current !== null) cancelAnimationFrame(optimizeFrameRef.current);
    };
  }, []);
  const [notePickerKind, setNotePickerKind] = useState<'note' | 'pdf'>('note');
  const [menu, setMenu] = useState<OpenMenu | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  /** The pan/zoom-transformed layer that holds every card and arrow (what gets exported). */
  const worldLayerRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const menuIdRef = useRef(0);
  // World-space top-left the note picker's card should land at — set when it
  // was opened from the background menu, undefined for the toolbar button
  // (which drops the card at the viewport center).
  const notePickerDropRef = useRef<Point | undefined>(undefined);
  const docRef = useRef<CanvasDocument | null>(null);
  const history = useCanvasHistory({ getDoc: () => docRef.current, applyDoc: applyHistoryDoc });
  /** A note/PDF being dragged over the board: the card that would be dropped, in world coordinates. */
  const [dropPreview, setDropPreview] = useState<{ path: string; isPdf: boolean; x: number; y: number } | null>(null);
  /** The arrow whose label is being typed, and where (world coords) its input sits. */
  const [arrowLabelEdit, setArrowLabelEdit] = useState<ArrowLabelEdit | null>(null);
  // Mirrors the state so blur/Escape/Enter each see whether an edit is still open.
  const arrowLabelEditRef = useRef<ArrowLabelEdit | null>(null);
  function setLabelEdit(next: ArrowLabelEdit | null) {
    arrowLabelEditRef.current = next;
    setArrowLabelEdit(next);
  }
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const marqueeDragState = useRef<{ pointerId: number; startClientX: number; startClientY: number } | null>(null);
  // Snapshot of every group-drag member's pre-drag position, taken at
  // pointerdown on a card's drag strip — lets `handleMoveBy` apply the same
  // dx/dy to the whole group instead of only the one card the pointer is on.
  const groupDragSnapshotRef = useRef<Map<string, Point> | null>(null);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  // Opening or closing a side pane resizes this board. Shifting the pan by
  // half of each size change keeps whatever is at the middle of the view at
  // the middle, instead of the content staying pinned to the top-left corner.
  // (Observed after the doc loads: the viewport element doesn't exist before.)
  const isBoardMounted = doc !== null;
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const observer = new ResizeObserver(() => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      const dx = (next.w - last.w) / 2;
      const dy = (next.h - last.h) / 2;
      last = next;
      if (dx !== 0 || dy !== 0) setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isBoardMounted]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const relativePath = toRelativePath(vaultRoot, path);

  // Every arrow's route — a free-angle line from one card's edge to the
  // other's, routed around the other cards by libavoid when it's loaded (see
  // `useArrowRoutes`), plus where arrows cross (drawn as hop bumps). Recomputed
  // only when the document changes, so pan, zoom,
  // hover, selection and the marquee re-render without re-routing.
  const { routes: arrowRoutes, hops: arrowHops } = useArrowRoutes(doc);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const raw = await invoke<string>('read_note', { path });
        if (cancelled) return;
        replaceDoc(parseCanvasDocument(raw));
        history.clear();
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
      replaceDoc(null);
      setFocusedCardId(null);
      setSelectedCardIds(new Set());
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

  /** Installs `next` as the board's document. The ref is set first and
   *  synchronously: it, not React state, is what edits build on, so two edits
   *  in one event handler (or a rAF frame between renders) never read a stale
   *  document. */
  function replaceDoc(next: CanvasDocument | null) {
    docRef.current = next;
    setDoc(next);
  }

  /** Applies an edit, recording the document it replaced for undo per `mode`
   *  (see `HistoryMode`; every edit is its own step by default). */
  function updateDoc(updater: (doc: CanvasDocument) => CanvasDocument, mode: HistoryMode = 'push') {
    const before = docRef.current;
    if (!before) return;
    const after = updater(before);
    if (after === before) return;
    history.record(before, mode);
    replaceDoc(after);
    scheduleSave();
  }

  /** Puts an undo/redo result on the board, dropping selection and edit
   *  state that points at cards the restored document doesn't have. */
  function applyHistoryDoc(restored: CanvasDocument) {
    if (optimizeFrameRef.current !== null) {
      cancelAnimationFrame(optimizeFrameRef.current);
      optimizeFrameRef.current = null;
    }
    const cardIds = new Set(restored.cards.map((c) => c.id));
    replaceDoc(restored);
    scheduleSave();
    setSelectedCardIds((prev) => new Set([...prev].filter((id) => cardIds.has(id))));
    setFocusedCardId((id) => (id && cardIds.has(id) ? id : null));
    setEditingCardId(null);
    setLabelEdit(null);
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
      cards: d.cards.map((c) => {
        if (c.id !== cardId) return c;
        if (c.content.type === 'inline') return { ...c, content: { ...c.content, body } };
        if (c.content.type === 'title' || c.content.type === 'sticky' || c.content.type === 'warning') {
          return { ...c, content: { ...c.content, text: body } };
        }
        return c;
      }),
    }), { group: `text:${cardId}` });
  }

  /** `CanvasCard`'s `onMoveBy` — `dx`/`dy` is the total delta since drag
   *  start, applied uniformly to every card in `groupDragSnapshotRef`'s
   *  pre-drag snapshot (just the one card for a single-card drag) so a
   *  multi-card drag translates rigidly instead of distorting. */
  function handleMoveBy(cardId: string, dx: number, dy: number) {
    const snapshot = groupDragSnapshotRef.current;
    if (!snapshot?.has(cardId)) return;
    updateDoc((d) => ({
      ...d,
      cards: d.cards.map((c) => {
        const start = snapshot.get(c.id);
        return start ? { ...c, x: start.x + dx, y: start.y + dy } : c;
      }),
    }), { group: 'move' });
  }

  /** `CanvasCard`'s `onAutoSize` — a card measured itself (its content
   *  changed) so store the new box; arrows, marquee hits and keyboard nav all
   *  read `w`/`h` off the document. Skips sub-pixel changes so a stable card
   *  never re-saves. */
  function handleAutoSize(cardId: string, w: number, h: number) {
    // A size that isn't a real, positive number (a measurement taken mid-layout
    // or while the board is hidden) must never reach the saved file.
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    const card = docRef.current?.cards.find((c) => c.id === cardId);
    if (!card || (Math.abs(card.w - w) < 1 && Math.abs(card.h - h) < 1)) return;
    // Not an edit of the user's: a card re-measuring itself.
    updateDoc((d) => ({ ...d, cards: d.cards.map((c) => (c.id === cardId ? { ...c, w, h } : c)) }), 'skip');
  }

  function handleResizeImage(cardId: string, width: number) {
    updateDoc((d) => ({
      ...d,
      cards: d.cards.map((c) => (c.id === cardId && c.content.type === 'image' ? { ...c, content: { ...c.content, width } } : c)),
    }), { group: `resize:${cardId}` });
  }

  function handleChangeCaption(cardId: string, caption: string) {
    updateDoc((d) => ({
      ...d,
      cards: d.cards.map((c) => (c.id === cardId && c.content.type === 'image' ? { ...c, content: { ...c.content, caption } } : c)),
    }), { group: `caption:${cardId}` });
  }

  function handleDelete(cardId: string) {
    updateDoc((d) => ({
      ...d,
      cards: d.cards.filter((c) => c.id !== cardId),
      arrows: d.arrows.filter((a) => a.fromCardId !== cardId && a.toCardId !== cardId),
    }));
    setFocusedCardId((id) => (id === cardId ? null : id));
    setSelectedCardIds((prev) => {
      if (!prev.has(cardId)) return prev;
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
  }

  /** Backspace/Delete via `useCanvasKeyboardNav` — group-aware: removes the
   *  whole marquee selection when one exists, else falls back to the single
   *  id the hook passed (its `focusedCardId`-driven default). The per-card
   *  trash button in `CanvasCard` bypasses this and always calls
   *  `handleDelete` directly, so an explicit click there only ever removes
   *  the one card clicked, even inside a multi-selection. */
  function handleDeleteSelected(cardId: string) {
    deleteCards(selectedCardIds.size > 0 ? selectedCardIds : new Set([cardId]));
  }

  function deleteCards(idsToDelete: ReadonlySet<string>) {
    updateDoc((d) => ({
      ...d,
      cards: d.cards.filter((c) => !idsToDelete.has(c.id)),
      arrows: d.arrows.filter((a) => !idsToDelete.has(a.fromCardId) && !idsToDelete.has(a.toCardId)),
    }));
    setSelectedCardIds(new Set());
    setFocusedCardId(null);
  }

  async function handlePromote(cardId: string) {
    const current = docRef.current;
    if (!current) return;
    const next = await promoteCard(vaultRoot, relativePath, current, cardId);
    if (next === current) return;
    history.record(current, 'push');
    replaceDoc(next);
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
    setEditingCardId(newCardId);
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
    setEditingCardId(newCardId);
  }

  useCanvasKeyboardNav({
    enabled: doc !== null,
    containerRef: viewportRef,
    cards: doc?.cards ?? [],
    focusedCardId,
    onFocusCard: focusCard,
    onDeleteCard: handleDeleteSelected,
    onCreateConnectedCard: handleCreateConnectedCard,
    onStartTyping: handleStartTyping,
  });

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    // Figma-style wiring: a trackpad two-finger drag and a physical mouse's
    // scroll wheel are indistinguishable at the DOM level — only pinch (or
    // an explicit Ctrl+scroll) reliably sets `ctrlKey`. So plain wheel pans,
    // and only the ctrlKey-flagged gesture zooms toward the cursor.
    if (!event.ctrlKey) {
      setPan((prev) => ({ x: prev.x - event.deltaX, y: prev.y - event.deltaY }));
      return;
    }
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

  /** Used for keyboard nav and single-target selection (background click,
   *  marquee click-deselect, note insert) — always collapses to exactly
   *  `cardId` (or nothing). A card's own pointerdown goes through
   *  `handleCardPointerDown` instead, which can keep a multi-selection
   *  intact. Neither target is a naturally-focusable element (a plain `div`,
   *  unlike the promote/note/ghost `<button>`s, which already get real DOM
   *  focus from the click itself), so without the `viewportRef` focus call
   *  below, clicking one after something outside the board previously had
   *  focus (a sidebar button) would leave `document.activeElement`
   *  unchanged — `isWithinBoard()` (`useCanvasKeyboardNav.ts`) would then
   *  wrongly treat the very click that just selected a card as still
   *  "outside the board" and ignore the arrow key that follows it.
   *  `viewportRef` itself is `tabIndex={-1}` so it can receive this
   *  programmatic focus. */
  function focusCard(cardId: string | null) {
    setEditingCardId(null);
    setFocusedCardId(cardId);
    setSelectedCardIds(cardId ? new Set([cardId]) : new Set());
    viewportRef.current?.focus();
  }

  /** Snapshot of a set of cards' current x/y, keyed by id — read fresh off
   *  `docRef` (not React state) since this runs from pointerdown handlers
   *  that fire between renders. */
  function snapshotPositions(ids: ReadonlySet<string>): Map<string, Point> {
    const snapshot = new Map<string, Point>();
    for (const card of docRef.current?.cards ?? []) {
      if (ids.has(card.id)) snapshot.set(card.id, { x: card.x, y: card.y });
    }
    return snapshot;
  }

  /** `CanvasCard`'s `onFocus` — fires on pointerdown anywhere in a card that
   *  doesn't stop propagation (drag strip, body). Clicking into an existing
   *  multi-card selection keeps the whole group selected (and snapshots it
   *  for a potential group drag); clicking anything else collapses to just
   *  that one card, matching single-select's prior behavior. */
  function handleCardPointerDown(cardId: string) {
    history.breakGroup();
    setEditingCardId((prev) => (prev === cardId ? prev : null));
    setFocusedCardId(cardId);
    viewportRef.current?.focus();
    setSelectedCardIds((prev) => {
      const next = prev.has(cardId) && prev.size > 1 ? prev : new Set([cardId]);
      groupDragSnapshotRef.current = snapshotPositions(next);
      return next;
    });
  }

  /** `CanvasCard`'s `onDragEnd` — if the pointer released without actually
   *  dragging the card (a plain click into a multi-selection), narrow the
   *  selection down to just that card rather than leaving the whole group
   *  selected. */
  function handleCardDragEnd(cardId: string, moved: boolean) {
    if (moved) return;
    setEditingCardId(cardId);
    setSelectedCardIds((prev) => (prev.size > 1 && prev.has(cardId) ? new Set([cardId]) : prev));
  }

  /** Button-routed like PureRef: left (0) drags a marquee-select rect over
   *  the bare background; middle (1) pans, same as the old any-button drag
   *  used to do for every button. Left click's selection-vs-marquee outcome
   *  isn't decided here — it depends on how far the pointer travels, so
   *  that's resolved in `handleBackgroundPointerUp` instead. */
  function handleBackgroundPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    viewportRef.current?.focus();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.button === 1) {
      dragState.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
      return;
    }
    if (event.button === 0) {
      marqueeDragState.current = { pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY };
      const rect = event.currentTarget.getBoundingClientRect();
      setMarquee({ left: event.clientX - rect.left, top: event.clientY - rect.top, width: 0, height: 0 });
    }
  }

  function handleBackgroundPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const panDrag = dragState.current;
    if (panDrag && panDrag.pointerId === event.pointerId) {
      const dx = event.clientX - panDrag.lastX;
      const dy = event.clientY - panDrag.lastY;
      dragState.current = { ...panDrag, lastX: event.clientX, lastY: event.clientY };
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      return;
    }

    const marqueeDrag = marqueeDragState.current;
    if (marqueeDrag && marqueeDrag.pointerId === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const startLocalX = marqueeDrag.startClientX - rect.left;
      const startLocalY = marqueeDrag.startClientY - rect.top;
      const curLocalX = event.clientX - rect.left;
      const curLocalY = event.clientY - rect.top;
      setMarquee({
        left: Math.min(startLocalX, curLocalX),
        top: Math.min(startLocalY, curLocalY),
        width: Math.abs(curLocalX - startLocalX),
        height: Math.abs(curLocalY - startLocalY),
      });
    }
  }

  function handleBackgroundPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;

    const marqueeDrag = marqueeDragState.current;
    if (!marqueeDrag || marqueeDrag.pointerId !== event.pointerId) return;
    marqueeDragState.current = null;
    setMarquee(null);

    const distance = Math.hypot(event.clientX - marqueeDrag.startClientX, event.clientY - marqueeDrag.startClientY);
    if (distance < DRAG_CLICK_THRESHOLD_PX) {
      focusCard(null);
      return;
    }

    const worldStart = screenToWorld(marqueeDrag.startClientX, marqueeDrag.startClientY);
    const worldEnd = screenToWorld(event.clientX, event.clientY);
    const marqueeRect: Rect = {
      x: Math.min(worldStart.x, worldEnd.x),
      y: Math.min(worldStart.y, worldEnd.y),
      w: Math.abs(worldEnd.x - worldStart.x),
      h: Math.abs(worldEnd.y - worldStart.y),
    };
    const hits = (docRef.current?.cards ?? []).filter((c) => rectsIntersect(marqueeRect, c)).map((c) => c.id);
    setSelectedCardIds(new Set(hits));
    setFocusedCardId(hits[0] ?? null);
    setEditingCardId(null);
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

  /** Top-left for a new card: `at` when given (a right-click position),
   *  else centered in the current viewport. */
  function newCardOrigin(at?: Point): Point {
    if (at) return at;
    const center = viewportCenterWorld();
    return { x: center.x - DEFAULT_CARD_WIDTH / 2, y: center.y - DEFAULT_CARD_HEIGHT / 2 };
  }

  function handleAddCard(at?: Point) {
    const newCardId = ulid();
    const origin = newCardOrigin(at);
    updateDoc((d) => ({
      ...d,
      cards: [
        ...d.cards,
        {
          id: newCardId,
          x: origin.x,
          y: origin.y,
          w: DEFAULT_CARD_WIDTH,
          h: DEFAULT_CARD_HEIGHT,
          content: { type: 'inline', body: '' },
        },
      ],
    }));
    setFocusedCardId(newCardId);
    setAutoFocusCardId(newCardId);
    setEditingCardId(newCardId);
  }

  function handleOpenPicker(kind: 'note' | 'pdf', anchor: Point) {
    setNotePickerKind(kind);
    notePickerDropRef.current = undefined;
    setNotePickerAnchor(anchor);
  }

  /** Drops an existing note onto the board as a `{type: 'note', path}` card
   *  — the reverse of `promoteCard.ts` (writes nothing new to disk). If that
   *  note is already placed on this board, focuses the existing card instead
   *  of adding a duplicate — the same dedup call `findOrCreateGhost` makes
   *  for not-yet-created titles. */
  function handleInsertNoteCard(path: string, at?: Point, type: 'note' | 'pdf' = 'note') {
    const current = docRef.current;
    if (!current) return;
    const existing = current.cards.find((c) => c.content.type === type && c.content.path === path);
    if (existing) {
      focusCard(existing.id);
      return;
    }

    const newCardId = ulid();
    const origin = newCardOrigin(at);
    updateDoc((d) => ({
      ...d,
      cards: [
        ...d.cards,
        {
          id: newCardId,
          x: origin.x,
          y: origin.y,
          w: DEFAULT_CARD_WIDTH,
          h: DEFAULT_CARD_HEIGHT,
          content: { type, path },
        },
      ],
    }));
    focusCard(newCardId);
  }

  /** Adds one image card per path, fanned out diagonally from `at` (or the
   *  viewport center) so a multi-image paste/import doesn't stack them. */
  function addImageCards(paths: string[], at?: Point) {
    if (paths.length === 0) return;
    const origin = at ?? newCardOrigin();
    const cards: CanvasCardData[] = paths.map((path, i) => ({
      id: ulid(),
      x: origin.x + i * IMAGE_STAGGER_PX,
      y: origin.y + i * IMAGE_STAGGER_PX,
      w: IMAGE_CARD_WIDTH,
      h: DEFAULT_CARD_HEIGHT,
      content: { type: 'image', path },
    }));
    updateDoc((d) => ({ ...d, cards: [...d.cards, ...cards] }));
    setSelectedCardIds(new Set(cards.map((c) => c.id)));
    setFocusedCardId(cards[cards.length - 1].id);
  }

  async function importImages(load: () => Promise<string[]>, at?: Point) {
    try {
      addImageCards(await load(), at);
    } catch (error) {
      console.error('failed to add image to canvas', error);
    }
  }

  /** Copies the selected cards (and the arrows between them) to the app's card
   *  clipboard. Returns false when there was nothing to copy. */
  function copySelectionToClipboard(): boolean {
    const current = docRef.current;
    if (!current || selectedCardIds.size === 0) return false;
    const cards = current.cards.filter((c) => selectedCardIds.has(c.id) && isCopyableCard(c));
    if (cards.length === 0) return false;
    copyToCardClipboard(cards, current.arrows);
    return true;
  }

  function handleCopy(event: ClipboardEvent) {
    if (isTypingTarget(event.target) || !copySelectionToClipboard()) return;
    // The marker lets a later paste tell these cards from something copied since.
    event.clipboardData?.setData('text/plain', CARD_CLIPBOARD_MARKER);
    event.preventDefault();
  }

  /** Adds copies of `cards` (and their `arrows`) shifted by `offset`, selected. */
  function addClonedCards(cards: readonly CanvasCardData[], arrows: readonly CanvasArrowData[], offset: Point) {
    const cloned = cloneCards(cards, arrows, offset);
    if (cloned.cards.length === 0) return;
    updateDoc((d) => ({ ...d, cards: [...d.cards, ...cloned.cards], arrows: [...d.arrows, ...cloned.arrows] }));
    setSelectedCardIds(new Set(cloned.cards.map((c) => c.id)));
    setFocusedCardId(cloned.cards[0].id);
  }

  function handlePaste(event: ClipboardEvent) {
    // Text pasted into a card's editor (or any input) is theirs to handle.
    if (isTypingTarget(event.target)) return;
    const files = imageFilesFrom(event.clipboardData);
    if (files.length > 0) {
      event.preventDefault();
      void importImages(() => Promise.all(files.map((file) => saveImageFile(vaultRoot, file))));
      return;
    }
    const clip = takeCardClipboard(event.clipboardData?.getData('text/plain') ?? '');
    const bounds = clip && boundsOfCards(clip.cards);
    if (!clip || !bounds) return;
    event.preventDefault();
    // Centered in the view; each further paste of the same copy steps aside.
    const center = viewportCenterWorld();
    const step = (clip.pasteIndex - 1) * DUPLICATE_OFFSET_PX;
    addClonedCards(clip.cards, clip.arrows, {
      x: center.x - (bounds.x + bounds.w / 2) + step,
      y: center.y - (bounds.y + bounds.h / 2) + step,
    });
  }

  /** Image files dragged in from the OS (Finder) and dropped on the board. */
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const files = imageFilesFrom(event.dataTransfer);
    if (files.length === 0) return;
    event.preventDefault();
    const at = screenToWorld(event.clientX, event.clientY);
    void importImages(() => Promise.all(files.map((file) => saveImageFile(vaultRoot, file))), at);
  }

  function handleUndo() {
    if (optimizePass === null) history.undo();
  }

  function handleRedo() {
    if (optimizePass === null) history.redo();
  }

  /** ⌘Z / ⇧⌘Z / ⌘C / ⌘D. Copy and paste normally arrive as clipboard events
   *  (handled above); the ⌘C key path here covers the case where the native
   *  Edit menu leaves the key to the page. */
  function handleShortcut(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || isTypingTarget(event.target)) return;
    if (event.code === 'KeyZ') {
      event.preventDefault();
      if (event.shiftKey) handleRedo();
      else handleUndo();
    } else if (event.code === 'KeyC') {
      if (copySelectionToClipboard()) void navigator.clipboard?.writeText(CARD_CLIPBOARD_MARKER).catch(() => undefined);
    } else if (event.code === 'KeyD') {
      event.preventDefault();
      handleDuplicate(selectedCardIds);
    }
  }

  /** Top-left for a dragged-in note/PDF card so the pointer sits at its center. */
  function dropOrigin(detail: CanvasDropDetail): Point {
    const world = screenToWorld(detail.clientX, detail.clientY);
    return { x: world.x - DEFAULT_CARD_WIDTH / 2, y: world.y - DEFAULT_CARD_HEIGHT / 2 };
  }

  /** A note or PDF dragged out of the sidebar or tab list, hovering over the board. */
  function handleExternalDrag(detail: CanvasDragDetail) {
    if (!detail || detail.isCanvas) {
      setDropPreview(null);
      return;
    }
    setDropPreview({ path: detail.path, isPdf: detail.isPdf, ...dropOrigin(detail) });
  }

  /** ...and released over it. */
  function handleExternalDrop(detail: CanvasDropDetail) {
    setDropPreview(null);
    if (detail.isCanvas) return;
    handleInsertNoteCard(detail.path, dropOrigin(detail), detail.isPdf ? 'pdf' : 'note');
  }

  // Window-level listeners, so they work wherever focus is on the page (a paste
  // event targets the focused element, and clicking the board focuses nothing).
  const windowHandlersRef = useRef({ handleCopy, handlePaste, handleShortcut, handleExternalDrag, handleExternalDrop });
  windowHandlersRef.current = { handleCopy, handlePaste, handleShortcut, handleExternalDrag, handleExternalDrop };
  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => windowHandlersRef.current.handleCopy(event);
    const onPaste = (event: ClipboardEvent) => windowHandlersRef.current.handlePaste(event);
    const onKeyDown = (event: KeyboardEvent) => windowHandlersRef.current.handleShortcut(event);
    const onCanvasDrag = (event: Event) => windowHandlersRef.current.handleExternalDrag((event as CustomEvent<CanvasDragDetail>).detail);
    const onCanvasDrop = (event: Event) => windowHandlersRef.current.handleExternalDrop((event as CustomEvent<CanvasDropDetail>).detail);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(CANVAS_DRAG_EVENT, onCanvasDrag);
    window.addEventListener(CANVAS_DROP_EVENT, onCanvasDrop);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(CANVAS_DRAG_EVENT, onCanvasDrag);
      window.removeEventListener(CANVAS_DROP_EVENT, onCanvasDrop);
    };
  }, []);

  function handleAddTextBlock(type: 'title' | 'sticky' | 'warning', at?: Point) {
    const newCardId = ulid();
    const origin = at ?? newCardOrigin();
    updateDoc((d) => ({
      ...d,
      cards: [
        ...d.cards,
        { id: newCardId, x: origin.x, y: origin.y, w: DEFAULT_CARD_WIDTH, h: DEFAULT_CARD_HEIGHT, content: { type, text: '' } },
      ],
    }));
    setFocusedCardId(newCardId);
    setAutoFocusCardId(newCardId);
    setEditingCardId(newCardId);
  }

  const viewFrameRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (viewFrameRef.current !== null) cancelAnimationFrame(viewFrameRef.current);
  }, []);

  /** Eases the camera from where it is to `target` rather than jumping. */
  function animateViewTo(target: ViewState) {
    if (viewFrameRef.current !== null) cancelAnimationFrame(viewFrameRef.current);
    const from: ViewState = { zoom: zoomRef.current, pan: panRef.current };
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / VIEW_ANIMATION_MS);
      const eased = 1 - (1 - t) ** 3;
      setZoom(from.zoom + (target.zoom - from.zoom) * eased);
      setPan({
        x: from.pan.x + (target.pan.x - from.pan.x) * eased,
        y: from.pan.y + (target.pan.y - from.pan.y) * eased,
      });
      viewFrameRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    viewFrameRef.current = requestAnimationFrame(step);
  }

  function viewportSize() {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect ? { w: rect.width, h: rect.height } : null;
  }

  /** "Reset view": the cards move (as one undoable step) so their center sits
   *  at the middle of the default view, and the camera glides to that default
   *  view (100%, no pan) — so the board ends up centered on screen, and
   *  resetting again later keeps it centered. With no cards, only the camera resets. */
  function handleResetView() {
    animateViewTo({ zoom: 1, pan: { x: 0, y: 0 } });
    const viewport = viewportSize();
    const cards = docRef.current?.cards ?? [];
    const bounds = boundsOfCards(cards);
    if (!viewport || !bounds || optimizePass !== null) return;
    const shift = shiftToDefaultViewCenter(bounds, viewport);
    void animateCardsTo(new Map(cards.map((c) => [c.id, { x: c.x + shift.x, y: c.y + shift.y }])));
  }

  function fitCards(cards: readonly CanvasCardData[], maxZoom: number) {
    const viewport = viewportSize();
    const bounds = boundsOfCards(cards);
    if (!viewport || !bounds) return;
    animateViewTo(viewFittingRect(bounds, viewport, FIT_PADDING_PX, MIN_ZOOM, maxZoom, TOOLBAR_INSET_PX));
  }

  function handleFitAll() {
    // Never zooms in past 1: this is for seeing everything, not enlarging a lone card.
    fitCards(docRef.current?.cards ?? [], 1);
  }

  function handleFitSelection() {
    fitCards((docRef.current?.cards ?? []).filter((c) => selectedCardIds.has(c.id)), MAX_ZOOM);
  }

  /** Glides cards to `targets` (top-left positions by card id) rather than
   *  snapping, updating the doc every frame so arrows re-route in step.
   *  Resolves once the glide has finished. */
  function animateCardsTo(targets: ReadonlyMap<string, Point>, shouldRecordHistory = true): Promise<void> {
    const current = docRef.current;
    if (!current) return Promise.resolve();
    // One undo step for the whole glide; its frames below are not steps.
    if (shouldRecordHistory) history.record(current, 'push');
    if (optimizeFrameRef.current !== null) cancelAnimationFrame(optimizeFrameRef.current);
    const starts = new Map(current.cards.filter((c) => targets.has(c.id)).map((c) => [c.id, { x: c.x, y: c.y }]));
    const startedAt = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - startedAt) / OPTIMIZE_ANIMATION_MS);
        const eased = 1 - (1 - t) ** 3;
        updateDoc((d) => ({
          ...d,
          cards: d.cards.map((c) => {
            const from = starts.get(c.id);
            const to = targets.get(c.id);
            return from && to ? { ...c, x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased } : c;
          }),
        }), 'skip');
        if (t < 1 && !isUnmountedRef.current) {
          optimizeFrameRef.current = requestAnimationFrame(step);
          return;
        }
        optimizeFrameRef.current = null;
        resolve();
      };
      optimizeFrameRef.current = requestAnimationFrame(step);
    });
  }

  /** Re-lays out the board — only the selected cards when several are
   *  selected, else all.
   *  Runs `OPTIMIZE_PASSES` passes back to back, each animated and starting
   *  from the last one's result, so the user watches the layout settle. */
  async function handleOptimize() {
    const start = docRef.current;
    if (!start || start.cards.length < 2 || optimizePass !== null) return;
    const movable = selectedCardIds.size > 1 ? new Set(selectedCardIds) : undefined;
    // Labels are laid out as boxes of the size they're drawn at.
    const layoutArrows = start.arrows.map((a) => {
      const label = a.label ? layoutArrowLabel(a.label) : null;
      return { fromCardId: a.fromCardId, toCardId: a.toCardId, label: label ? { w: label.width, h: label.height } : undefined };
    });
    // All four passes are a single undo step.
    history.record(start, 'push');

    for (let pass = 1; pass <= OPTIMIZE_PASSES; pass++) {
      const current = docRef.current;
      if (!current || isUnmountedRef.current) break;
      setOptimizePass(pass);
      await animateCardsTo(optimizeLayout(current.cards, layoutArrows, movable, pass === 1), false);
    }
    setOptimizePass(null);
  }

  /** Mirrors the selected cards (or the whole board) left-right or top-bottom. */
  function handleFlip(axis: FlipAxis) {
    const current = docRef.current;
    if (!current || optimizePass !== null) return;
    const scoped = selectedCardIds.size > 1 ? current.cards.filter((c) => selectedCardIds.has(c.id)) : current.cards;
    void animateCardsTo(flipPositions(scoped, axis));
  }

  /** Saves the whole board (not just what's on screen) as a PNG. The save
   *  dialog comes first so cancelling costs nothing; then selection and edit
   *  state are cleared for the capture — so no selection outlines or open
   *  editors end up in the picture — and put back afterwards. */
  async function handleExportImage() {
    const bounds = boundsOfCards(docRef.current?.cards ?? []);
    const layer = worldLayerRef.current;
    if (!bounds || !layer || isExporting) return;
    setIsExporting(true);
    const selectionBefore = selectedCardIds;
    const focusBefore = focusedCardId;
    try {
      const target = await pickImageExportPath(path.split('/').pop() ?? 'canvas');
      if (!target) return;
      setSelectedCardIds(new Set());
      setFocusedCardId(null);
      setEditingCardId(null);
      setLabelEdit(null);
      await nextPaint();
      await exportBoardAsImage(layer, vaultRoot, bounds, zoomRef.current, target);
    } catch (error: unknown) {
      console.error('canvas image export failed', error);
      await message(`Could not export the image: ${error instanceof Error ? error.message : String(error)}`, {
        title: 'Export failed',
        kind: 'error',
      });
    } finally {
      setSelectedCardIds(selectionBefore);
      setFocusedCardId(focusBefore);
      setIsExporting(false);
    }
  }

  /** Turns the selected cards' arrangement (or the whole board's) one step: `1` clockwise, `-1` counterclockwise. */
  function handleRotate(direction: 1 | -1) {
    const current = docRef.current;
    if (!current || optimizePass !== null) return;
    const movable = selectedCardIds.size > 1 ? new Set(selectedCardIds) : undefined;
    void animateCardsTo(rotatePositions(current.cards, direction * ROTATE_STEP_DEGREES, movable));
  }

  function handleDuplicate(ids: ReadonlySet<string>) {
    const current = docRef.current;
    if (!current) return;
    const cards = current.cards.filter((c) => ids.has(c.id) && isCopyableCard(c));
    addClonedCards(cards, current.arrows, { x: DUPLICATE_OFFSET_PX, y: DUPLICATE_OFFSET_PX });
  }

  /** Sets an arrow's label; empty removes it. */
  function applyArrowLabel(arrowId: string, label: string) {
    const arrow = docRef.current?.arrows.find((a) => a.id === arrowId);
    if (!arrow || (arrow.label ?? '') === label) return;
    updateDoc((d) => ({ ...d, arrows: d.arrows.map((a) => (a.id === arrowId ? { ...a, label: label || undefined } : a)) }));
  }

  function handleEditArrowLabel(arrowId: string) {
    const arrow = docRef.current?.arrows.find((a) => a.id === arrowId);
    const polyline = arrowRoutes.get(arrowId);
    if (!arrow || !polyline) return;
    const { labelPoint } = buildArrowPath(polyline, ARROW_CORNER_RADIUS, arrowHops.get(arrowId));
    setLabelEdit({ arrowId, x: labelPoint.x, y: labelPoint.y, value: arrow.label ?? '' });
  }

  function commitArrowLabel() {
    const edit = arrowLabelEditRef.current;
    if (!edit) return;
    setLabelEdit(null);
    applyArrowLabel(edit.arrowId, edit.value.trim());
  }

  function handleRemoveArrows(ids: ReadonlySet<string>) {
    updateDoc((d) => ({ ...d, arrows: d.arrows.filter((a) => !ids.has(a.fromCardId) && !ids.has(a.toCardId)) }));
  }

  /** Right-click: a card under the pointer gets the card menu (acting on the
   *  whole selection when that card is part of a multi-selection — the card's
   *  own pointerdown already selected it by now), bare background gets the
   *  board menu. */
  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const current = docRef.current;
    if (!current) return;
    const arrowId = (event.target as Element).closest('[data-arrow-id]')?.getAttribute('data-arrow-id');
    if (arrowId) {
      menuIdRef.current += 1;
      const items = buildArrowMenu({
        hasLabel: Boolean(current.arrows.find((a) => a.id === arrowId)?.label),
        onEditLabel: () => handleEditArrowLabel(arrowId),
        onRemoveLabel: () => applyArrowLabel(arrowId, ''),
        onDelete: () => updateDoc((d) => ({ ...d, arrows: d.arrows.filter((a) => a.id !== arrowId) })),
      });
      setMenu({ id: menuIdRef.current, x: event.clientX, y: event.clientY, items });
      return;
    }
    const cardId = (event.target as Element).closest('[data-canvas-card-id]')?.getAttribute('data-canvas-card-id');
    const card = cardId ? current.cards.find((c) => c.id === cardId) : undefined;
    const world = screenToWorld(event.clientX, event.clientY);

    let items: ContextMenuItem[];
    if (card) {
      const targetIds: ReadonlySet<string> = selectedCardIds.has(card.id) ? selectedCardIds : new Set([card.id]);
      items = buildCardMenu({
        card,
        targetCount: targetIds.size,
        canDuplicate: current.cards.some((c) => targetIds.has(c.id) && isCopyableCard(c)),
        arrowCount: current.arrows.filter((a) => targetIds.has(a.fromCardId) || targetIds.has(a.toCardId)).length,
        onOpenNote: () => (card.content.type === 'note' || card.content.type === 'pdf') && onNavigate(card.content.path),
        onPromote: () => void handlePromote(card.id),
        onDuplicate: () => handleDuplicate(targetIds),
        onRemoveArrows: () => handleRemoveArrows(targetIds),
        onDelete: () => deleteCards(targetIds),
      });
    } else {
      items = buildBackgroundMenu({
        hasCards: current.cards.length > 0,
        onNewCard: () => handleAddCard(world),
        onAddImage: () => void importImages(() => pickAndCopyImages(vaultRoot), world),
        onExportImage: () => void handleExportImage(),
        onAddTitle: () => handleAddTextBlock('title', world),
        onAddSticky: () => handleAddTextBlock('sticky', world),
        onAddWarning: () => handleAddTextBlock('warning', world),
        onAddPdf: () => {
          setNotePickerKind('pdf');
          notePickerDropRef.current = world;
          setNotePickerAnchor({ x: event.clientX, y: event.clientY });
        },
        onAddNote: () => {
          setNotePickerKind('note');
          notePickerDropRef.current = world;
          setNotePickerAnchor({ x: event.clientX, y: event.clientY });
        },
        onSelectAll: () => {
          setSelectedCardIds(new Set(current.cards.map((c) => c.id)));
          setFocusedCardId(current.cards[0]?.id ?? null);
        },
        onResetView: handleResetView,
      });
    }
    menuIdRef.current += 1;
    setMenu({ id: menuIdRef.current, x: event.clientX, y: event.clientY, items });
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

  const arrowColor = doc.arrowColor ?? ARROW_COLOR;
  const cardsById = new Map(doc.cards.map((card) => [card.id, card]));
  const fromCardForDraft = arrowDraft ? cardsById.get(arrowDraft.fromCardId) : null;
  // The in-progress dashed preview: a straight line from the source card's
  // edge to the cursor. Not routed around other cards — it's transient, and a
  // line to wherever the pointer is should follow the pointer exactly.
  const draftArrowRoute =
    arrowDraft && fromCardForDraft
      ? buildArrowPath(
          [
            exitPoint(fromCardForDraft, { x: fromCardForDraft.x + fromCardForDraft.w / 2, y: fromCardForDraft.y + fromCardForDraft.h / 2 }, arrowDraft),
            { x: arrowDraft.x, y: arrowDraft.y },
          ],
          ARROW_CORNER_RADIUS,
        )
      : null;

  return (
    <div
      ref={viewportRef}
      // Programmatically focusable only (-1 keeps it out of natural Tab
      // order, which this board's own Tab+direction chord already repurposes)
      // — see `focusCard`'s doc comment above for why it needs to be.
      tabIndex={-1}
      data-drop-id={CANVAS_DROP_ID}
      className="relative h-full w-full touch-none select-none overflow-hidden outline-none"
      onWheel={handleWheel}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handleBackgroundPointerMove}
      onPointerUp={handleBackgroundPointerUp}
      onPointerLeave={handleBackgroundPointerUp}
    >
      <div
        ref={worldLayerRef}
        className="absolute left-0 top-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
      >
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={0} height={0}>
          <CanvasArrowDefs color={arrowColor} />
          {doc.arrows.map((arrow) => {
            const polyline = arrowRoutes.get(arrow.id);
            if (!polyline) return null;
            const route = buildArrowPath(polyline, ARROW_CORNER_RADIUS, arrowHops.get(arrow.id));
            return <CanvasArrow key={arrow.id} arrowId={arrow.id} color={arrowColor} route={route} label={arrow.label} onEditLabel={handleEditArrowLabel} />;
          })}
          {draftArrowRoute && (
            <path d={draftArrowRoute.path} fill="none" stroke={arrowColor} strokeWidth={ARROW_STROKE_PX} strokeDasharray="4 4" />
          )}
        </svg>
        {doc.cards.map((card) => (
          <CanvasCard
            key={card.id}
            card={card}
            vaultRoot={vaultRoot}
            zoom={zoom}
            isSelected={selectedCardIds.has(card.id)}
            isEditing={card.id === editingCardId}
            onNavigate={onNavigate}
            onChangeBody={handleChangeBody}
            onResizeImage={handleResizeImage}
            onChangeCaption={handleChangeCaption}
            onMoveBy={handleMoveBy}
            onAutoSize={handleAutoSize}
            onPromote={(cardId) => void handlePromote(cardId)}
            onDelete={handleDelete}
            onFocus={handleCardPointerDown}
            onDragEnd={handleCardDragEnd}
            onStartArrow={handleStartArrow}
            isLinking={isMetaHeld}
            autoFocus={card.id === autoFocusCardId}
          />
        ))}
        {dropPreview && <DropPreviewCard {...dropPreview} />}
        {arrowLabelEdit && (
          <input
            autoFocus
            value={arrowLabelEdit.value}
            onFocus={(event) => event.target.select()}
            onChange={(event) => setLabelEdit({ ...arrowLabelEdit, value: event.target.value })}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') commitArrowLabel();
              if (event.key === 'Escape') setLabelEdit(null);
            }}
            onBlur={commitArrowLabel}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder="label…"
            className="absolute border border-border-strong bg-bg px-1.5 py-0.5 text-center text-fg-prominent outline-none"
            style={{ left: arrowLabelEdit.x - ARROW_LABEL_INPUT_WIDTH / 2, top: arrowLabelEdit.y - 26, width: ARROW_LABEL_INPUT_WIDTH, fontSize: '0.75rem' }}
          />
        )}
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
      {marquee && (
        <div
          className="pointer-events-none absolute border"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
            borderColor: 'var(--accent-link)',
            // Hand-duplicated RGB of --accent-link (tokens.css), matching
            // CanvasCard.tsx's note-card tint — a plain overlay div, not a
            // CSS-var-driven element, so var() can't build this alpha fill.
            backgroundColor: 'rgba(77, 200, 242, 0.12)',
          }}
        />
      )}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-3">
        <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
          [canvas]
        </span>
      </div>
      {notePickerAnchor && (
        <NotePickerPopover
          vaultRoot={vaultRoot}
          kind={notePickerKind}
          x={notePickerAnchor.x}
          y={notePickerAnchor.y}
          onSelect={(path) => {
            handleInsertNoteCard(path, notePickerDropRef.current, notePickerKind);
            setNotePickerAnchor(null);
          }}
          onClose={() => setNotePickerAnchor(null)}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-stretch justify-center gap-3">
        <EditToolbar canUndo={history.canUndo && optimizePass === null} canRedo={history.canRedo && optimizePass === null} onUndo={handleUndo} onRedo={handleRedo} />
        <NewToolbar
          onAddText={() => handleAddCard()}
          onAddTitle={() => handleAddTextBlock('title')}
          onAddSticky={() => handleAddTextBlock('sticky')}
          onAddWarning={() => handleAddTextBlock('warning')}
          onPickNote={(anchor) => handleOpenPicker('note', anchor)}
          onPickPdf={(anchor) => handleOpenPicker('pdf', anchor)}
          onAddImage={() => void importImages(() => pickAndCopyImages(vaultRoot))}
        />
        <ViewToolbar
          onResetView={handleResetView}
          onFitAll={handleFitAll}
          onFitSelection={handleFitSelection}
          hasCards={doc.cards.length > 0}
          hasSelection={selectedCardIds.size > 0}
        />
        <LayoutToolbar
          isSelectionScoped={selectedCardIds.size > 1}
          optimizePass={optimizePass}
          onOptimize={() => void handleOptimize()}
          onFlip={handleFlip}
          onRotate={handleRotate}
        />
        <ExportToolbar isDisabled={isExporting || doc.cards.length === 0} onExportImage={() => void handleExportImage()} />
        <ToolbarShell>
          <ArrowColorPicker color={arrowColor} onChange={(color) => updateDoc((d) => ({ ...d, arrowColor: color }))} />
        </ToolbarShell>
      </div>
      {menu && (
        <ContextMenu
          key={menu.id}
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu((open) => (open?.id === menu.id ? null : open))}
        />
      )}
    </div>
  );
}
