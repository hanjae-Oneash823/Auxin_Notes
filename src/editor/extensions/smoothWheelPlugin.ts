import { EditorView, ViewPlugin } from '@codemirror/view';

// Higher = snappier catch-up, lower = smoother but laggier. At 60fps this
// settles (~95% of the way to target) in about 15 frames (~250ms) — close to
// macOS's own trackpad-momentum feel, not sluggish.
const EASE_FACTOR = 0.18;
const SNAP_THRESHOLD_PX = 0.5;

/**
 * Smooths mouse-wheel scrolling in the editor's own scroll container
 * (`view.scrollDOM`, i.e. `.cm-scroller`) — plain wheel-mouse input arrives
 * as large discrete deltaY jumps (one per notch), which read as choppy next
 * to a trackpad's own OS-level momentum smoothing. Every wheel delta
 * (trackpad included) feeds one shared rAF-driven lerp toward a target
 * scroll offset instead of jumping `scrollTop` immediately — trackpad input
 * stays effectively instant (its own deltas are already small and frequent,
 * so the lerp catches up within a frame or two), while a mouse's coarse
 * notches get spread into a short animated glide.
 *
 * Manually setting `scrollTop` each frame (rather than, say, animating via
 * CSS) still fires the DOM's native `scroll` event, which is exactly what
 * CM6 already listens to internally to re-render the visible line range —
 * so this doesn't fight the editor's own viewport virtualization, just
 * changes how quickly `scrollTop` gets there.
 */
export function createSmoothWheelPlugin() {
  return ViewPlugin.fromClass(
    class {
      private target: number;
      private rafId: number | null = null;
      private readonly onWheel: (event: WheelEvent) => void;

      constructor(private readonly view: EditorView) {
        this.target = view.scrollDOM.scrollTop;
        this.onWheel = (event) => this.handleWheel(event);
        view.scrollDOM.addEventListener('wheel', this.onWheel, { passive: false });
      }

      /** `WheelEvent.deltaMode` reports px (0, by far the common case),
       *  line (1), or page (2) — the latter two need converting to px using
       *  this editor's own metrics before they can be added to `target`. */
      private deltaToPx(delta: number, mode: number): number {
        if (mode === 1) return delta * this.view.defaultLineHeight;
        if (mode === 2) return delta * this.view.scrollDOM.clientHeight;
        return delta;
      }

      private handleWheel(event: WheelEvent) {
        // Horizontal wheel gestures (shift-scroll, trackpad swipe) pass
        // through untouched — this editor never scrolls horizontally
        // (EditorView.lineWrapping, markdownSetup.ts), and smoothing only
        // deltaY would fight a diagonal gesture's own deltaX handling.
        if (event.deltaX !== 0 || event.deltaY === 0) return;
        // A trackpad (or Magic Mouse) already arrives pre-smoothed by the
        // OS's own momentum curve — small, frequent, fractional deltas.
        // Re-smoothing that through this lerp adds a second, independently
        // paced deceleration on top of one that's already settling, which
        // is what reads as janky rather than helpful. WKWebView sets this
        // property on wheel events from any device with a configurable
        // natural-scrolling direction (trackpad, Magic Mouse) and omits it
        // entirely for a plain wheel mouse, so it's a reliable way to only
        // intercept the coarse, unsmoothed notches that actually need it.
        if ('webkitDirectionInvertedFromDevice' in event) return;
        event.preventDefault();

        const scroller = this.view.scrollDOM;
        const max = scroller.scrollHeight - scroller.clientHeight;
        // Resync to the real scrollTop only when starting a fresh gesture
        // (no animation already in flight) — otherwise an external scroll
        // that happened between wheel events (jump-to-heading, cursor moved
        // past the viewport) would be silently overwritten by a stale
        // target once wheeling resumes.
        if (this.rafId === null) this.target = scroller.scrollTop;
        const delta = this.deltaToPx(event.deltaY, event.deltaMode);
        this.target = Math.min(max, Math.max(0, this.target + delta));

        if (this.rafId === null) this.rafId = requestAnimationFrame(this.step);
      }

      private readonly step = () => {
        const scroller = this.view.scrollDOM;
        const next = scroller.scrollTop + (this.target - scroller.scrollTop) * EASE_FACTOR;
        if (Math.abs(this.target - next) < SNAP_THRESHOLD_PX) {
          scroller.scrollTop = this.target;
          this.rafId = null;
          return;
        }
        scroller.scrollTop = next;
        this.rafId = requestAnimationFrame(this.step);
      };

      destroy() {
        this.view.scrollDOM.removeEventListener('wheel', this.onWheel);
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      }
    },
  );
}
