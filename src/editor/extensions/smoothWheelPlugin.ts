import { EditorView, ViewPlugin } from '@codemirror/view';

// Higher = snappier catch-up, lower = smoother but laggier. At 60fps this
// settles (~95% of the way to target) in about 15 frames (~250ms) — close to
// macOS's own trackpad-momentum feel, not sluggish.
const EASE_FACTOR = 0.18;
const SNAP_THRESHOLD_PX = 0.5;
const DOM_DELTA_PIXEL = 0;
/** WebKit's px-per-line for a wheel mouse's line deltas (its Scrollbar::pixelsPerLineStep). */
const WHEEL_LINE_PX = 40;
/** A trackpad flick can land on a whole multiple of WHEEL_LINE_PX too — such
 *  a delta arriving this soon after a known trackpad event is read as part of
 *  that same gesture, not as a mouse notch. */
const TRACKPAD_GESTURE_GAP_MS = 150;

/**
 * Whether a wheel event is a wheel mouse's coarse notch (worth easing) rather
 * than a trackpad's or Magic Mouse's delta, which the OS has already smoothed
 * with its own momentum curve — re-smoothing that adds a second, independently
 * paced deceleration on top of one that's already settling.
 *
 * WKWebView exposes no device flag: `webkitDirectionInvertedFromDevice` lives
 * on WheelEvent.prototype, so `in` finds it on every event, mouse included;
 * and both devices report deltaMode 0 with the same wheelDeltaY/deltaY ratio.
 * What does differ (probed against WKWebView directly): a continuous
 * (trackpad) event's deltaY is a whole pixel count, while a mouse notch's is
 * its accelerated line delta × WHEEL_LINE_PX — fractional in practice
 * (e.g. 3.9996, 47.9998), or else a whole multiple of WHEEL_LINE_PX.
 */
export function isWheelMouseNotch(
  event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>,
  msSinceTrackpadEvent: number,
): boolean {
  if (event.deltaMode !== DOM_DELTA_PIXEL) return true;
  if (!Number.isInteger(event.deltaY)) return true;
  return event.deltaY % WHEEL_LINE_PX === 0 && msSinceTrackpadEvent >= TRACKPAD_GESTURE_GAP_MS;
}

/**
 * Smooths mouse-wheel scrolling in the editor's own scroll container
 * (`view.scrollDOM`, i.e. `.cm-scroller`) — plain wheel-mouse input arrives
 * as large discrete deltaY jumps (one per notch), which read as choppy next
 * to a trackpad's own OS-level momentum smoothing. Mouse notches (see
 * isWheelMouseNotch) feed one shared rAF-driven lerp toward a target scroll
 * offset instead of jumping `scrollTop` immediately; trackpad input scrolls
 * natively, untouched.
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
      private lastTrackpadEventAt = Number.NEGATIVE_INFINITY;
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
        if (!isWheelMouseNotch(event, event.timeStamp - this.lastTrackpadEventAt)) {
          // Scrolls natively — and any glide still in flight has to stop, or
          // each frame would pull scrollTop back toward its stale target.
          this.lastTrackpadEventAt = event.timeStamp;
          this.cancelGlide();
          return;
        }
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

      private cancelGlide() {
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }

      destroy() {
        this.view.scrollDOM.removeEventListener('wheel', this.onWheel);
        this.cancelGlide();
      }
    },
  );
}
