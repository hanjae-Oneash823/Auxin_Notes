import { useLayoutEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { reorderIds } from './tabOrder';

/** The pinned, non-closable first tab — always present, id is a fixed
 *  sentinel rather than a note path. Exported so App.tsx (which owns tab
 *  state) and this file (which needs to style it distinctly) agree on it. */
export const HOME_TAB_ID = 'home';

export interface TabItem {
  id: string;
  label: string;
  closable: boolean;
}

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  /** Reorders tabs by dragging — moves `draggedId` next to `targetId`,
   *  after it when `placeAfter` is true. Omitted where drag-to-reorder
   *  isn't wired up. */
  onReorder?: (draggedId: string, targetId: string, placeAfter: boolean) => void;
  /** Layout/border classes vary by where this is embedded — the window
   *  header (inline, no border, shares the row with the app label) vs. the
   *  standalone fallback row above the editor on non-macOS platforms. */
  className?: string;
}

/** Pixels of pointer movement before a mousedown counts as a drag rather
 *  than a click. Below this, releasing still selects the tab as normal. */
const DRAG_THRESHOLD_PX = 4;

/** How long the FLIP slide takes when a tab's position changes because
 *  another tab is being dragged past it, and the curve it eases along —
 *  reusing the app's own `--ease-panel` token (the same curve the tab's
 *  hover/active color transition already uses) instead of a generic linear
 *  `ease`, so the slide reads as part of the same motion language. */
const REORDER_ANIMATION_MS = 220;
const REORDER_ANIMATION_EASE = 'var(--ease-panel)';

interface DragState {
  id: string;
  startX: number;
  startY: number;
  moved: boolean;
}

interface HoverTarget {
  id: string;
  placeAfter: boolean;
}

function sameTarget(a: HoverTarget | null, b: HoverTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.placeAfter === b.placeAfter;
}

/** Browser/editor-style tab strip for the middle panel. Deliberately not
 *  bracketed like the sidebar's `[label]` chrome — the underline/background
 *  already reads as "tab", and a full note title in brackets gets noisy.
 *
 *  Reordering is done with manual pointer tracking rather than the native
 *  HTML5 Drag and Drop API — `dragstart`/`drop` don't fire reliably for
 *  internal element reordering inside Tauri's macOS WKWebView. The drop
 *  target is resolved from tab geometry (each candidate's bounding rect)
 *  rather than `elementFromPoint`, so dragging past the last tab into the
 *  empty space beyond it still resolves to "after the last tab" instead of
 *  hitting nothing.
 *
 *  While dragging, tabs render in their live preview order (via
 *  `reorderIds`, the same helper `App.tsx` uses to commit the drop) so the
 *  rest of the strip visibly slides out of the way in real time. The slide
 *  itself is a manual FLIP: `useLayoutEffect` compares each tab's position
 *  before/after the preview order changes and animates the delta away with
 *  a transform, since a plain array reorder alone just snaps elements to
 *  their new flex position with no transition. */
export function TabBar({ tabs, activeTabId, onSelect, onClose, onReorder, className }: TabBarProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const hoverTargetRef = useRef<HoverTarget | null>(null);
  const suppressClickRef = useRef(false);
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

  const displayTabs =
    draggedId && hoverTarget
      ? reorderIds(
          tabs.map((tab) => tab.id),
          draggedId,
          hoverTarget.id,
          hoverTarget.placeAfter,
        )
          .map((id) => tabs.find((tab) => tab.id === id))
          .filter((tab): tab is TabItem => tab !== undefined)
      : tabs;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const elements = Array.from(container.querySelectorAll<HTMLElement>('[data-tab-id]'));

    // `getBoundingClientRect()` reports the element's current *painted*
    // box, transform included — so if a previous slide is still mid-flight
    // when a new reorder comes in, measuring now would capture an
    // interpolated, still-moving position instead of the resting layout
    // position. Cancelling any in-flight transform/transition first and
    // forcing a reflow guarantees every measurement below is the true,
    // untransformed layout position, which is what the FLIP diff needs to
    // stay correct across back-to-back reorders during a fast drag.
    for (const el of elements) {
      el.style.transition = 'none';
      el.style.transform = 'none';
    }
    void container.offsetWidth;

    const prevRects = prevRectsRef.current;
    const nextRects = new Map<string, DOMRect>();
    for (const el of elements) {
      const id = el.dataset.tabId;
      if (id) nextRects.set(id, el.getBoundingClientRect());
    }

    // Invert: jump each moved tab back to where it visually was, still with
    // transitions off, then force one more reflow so that jump actually
    // applies before we animate away from it.
    for (const el of elements) {
      const id = el.dataset.tabId;
      if (!id) continue;
      const prevRect = prevRects.get(id);
      const nextRect = nextRects.get(id);
      if (!prevRect || !nextRect) continue;
      const dx = prevRect.left - nextRect.left;
      if (dx !== 0) el.style.transform = `translateX(${dx}px)`;
    }
    void container.offsetWidth;

    // Play: transition every moved tab back to its resting position. The
    // inline `transition` is cleared once the slide finishes so it doesn't
    // linger and shadow the tab's own `transition-colors` class afterward.
    for (const el of elements) {
      const id = el.dataset.tabId;
      if (!id) continue;
      const prevRect = prevRects.get(id);
      const nextRect = nextRects.get(id);
      if (!prevRect || !nextRect || prevRect.left === nextRect.left) continue;

      el.style.transition = `transform ${REORDER_ANIMATION_MS}ms ${REORDER_ANIMATION_EASE}`;
      el.style.transform = '';
      const clearTransition = (event: TransitionEvent) => {
        if (event.propertyName !== 'transform') return;
        el.style.transition = '';
        el.removeEventListener('transitionend', clearTransition);
      };
      el.addEventListener('transitionend', clearTransition);
    }

    prevRectsRef.current = nextRects;
  });

  function resolveHoverTarget(pointerX: number, draggedTabId: string): HoverTarget | null {
    const container = containerRef.current;
    if (!container) return null;

    const candidates = Array.from(container.querySelectorAll<HTMLElement>('[data-tab-id]')).filter(
      (el) => el.dataset.tabId !== HOME_TAB_ID && el.dataset.tabId !== draggedTabId,
    );
    if (candidates.length === 0) return null;

    // A single consistent midpoint test, left to right: the first candidate
    // the pointer hasn't reached the middle of yet is the target ("before"
    // it). This must be the only test — a candidate's own left-edge check
    // used to run too, and being unconditional it clobbered the midpoint
    // result on every following iteration, which is what made leftward
    // drags need a full extra tab-width of travel to register while
    // rightward drags moved almost immediately.
    for (const el of candidates) {
      const id = el.dataset.tabId;
      if (!id) continue;
      const rect = el.getBoundingClientRect();
      if (pointerX < rect.left + rect.width / 2) {
        return { id, placeAfter: false };
      }
    }

    const lastId = candidates[candidates.length - 1].dataset.tabId;
    return lastId ? { id: lastId, placeAfter: true } : null;
  }

  function handleMouseDown(tabId: string, event: React.MouseEvent) {
    if (event.button !== 0) return;
    dragState.current = { id: tabId, startX: event.clientX, startY: event.clientY, moved: false };

    function handleMouseMove(moveEvent: MouseEvent) {
      const state = dragState.current;
      if (!state) return;

      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        state.moved = true;
        setDraggedId(state.id);
        // The FLIP transform below still counts toward this container's
        // scrollable overflow area even though it doesn't change layout, so
        // a reorder mid-drag can otherwise pop a scrollbar and shove the
        // scroll position, making tabs appear to vanish. Scrolling isn't
        // needed mid-drag anyway, so just suspend it for the duration.
        if (containerRef.current) containerRef.current.style.overflowX = 'hidden';
      }
      if (!state.moved) return;

      const nextTarget = resolveHoverTarget(moveEvent.clientX, state.id);
      if (sameTarget(hoverTargetRef.current, nextTarget)) return;
      hoverTargetRef.current = nextTarget;
      setHoverTarget(nextTarget);
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const state = dragState.current;
      const target = hoverTargetRef.current;
      dragState.current = null;
      hoverTargetRef.current = null;
      setDraggedId(null);
      setHoverTarget(null);
      if (containerRef.current) containerRef.current.style.overflowX = '';

      if (state?.moved) {
        suppressClickRef.current = true;
        if (target && target.id !== state.id) onReorder?.(state.id, target.id, target.placeAfter);
      }
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleClick(tabId: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(tabId);
  }

  return (
    <div ref={containerRef} className={`flex items-stretch overflow-x-auto ${className ?? ''}`}>
      {displayTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isHome = tab.id === HOME_TAB_ID;
        return (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            // Plain divs aren't in Tauri's built-in "clickable" set, so
            // nested inside the header's `data-tauri-drag-region="deep"`
            // (TitleBar.tsx) a tab would otherwise both drag the window and
            // fire its own click/reorder handlers on the same mousedown.
            // Opting out here keeps tab clicks/drags local to the tab strip.
            data-tauri-drag-region="false"
            onMouseDown={isHome ? undefined : (event) => handleMouseDown(tab.id, event)}
            onClick={() => handleClick(tab.id)}
            className={`group flex shrink-0 cursor-pointer select-none items-center gap-1.5 border-r-[1.5px] border-r-border-strong py-1.5 tracking-menu uppercase transition-colors duration-panel ease-panel ${
              tab.closable ? 'pl-3 pr-3' : 'px-3'
            } ${draggedId === tab.id ? 'opacity-40' : ''} ${
              isHome
                ? 'bg-yellow-400 text-black'
                : isActive
                  ? 'bg-border-subtle text-fg-prominent'
                  : 'text-fg-faint hover:text-fg-prominent'
            }`}
            style={{ fontSize: '0.7rem' }}
          >
            {/* A fixed-width spacer mirrors the close button's width on the
                opposite side, so the label centers in the remaining track
                with no overlap, whether or not the button is visible. */}
            {tab.closable && <span aria-hidden className="w-[11px] shrink-0" />}
            <span className="max-w-[160px] flex-1 truncate text-center">{tab.label}</span>
            {tab.closable && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
                className="flex w-[11px] shrink-0 items-center justify-center text-accent-link-broken opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X size={11} weight="bold" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
