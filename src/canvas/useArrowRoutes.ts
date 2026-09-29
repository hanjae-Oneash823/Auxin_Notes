import { useEffect, useMemo, useRef, useState } from 'react';
import type { Avoid } from 'libavoid-js';
import type { CanvasDocument } from '../vault/canvasTypes';
import { findArrowCrossings } from './arrowCrossings';
import { clipRoute, planArrows } from './arrowGeometry';
import type { Point } from './canvasGeometry';
import { loadLibavoid } from './libavoidLoader';
import { LibavoidSession } from './libavoidSession';

/** Above this many arrows, arrows are drawn as plain straight lines instead of
 *  being routed around cards. Measured: at 200 arrows the first route takes
 *  ~360 ms and dragging a card ~16 ms a frame (worst 22); at 300 it's ~1 s and
 *  ~37 ms, which starts to stutter. */
export const LIBAVOID_MAX_ARROWS = 200;

export interface ArrowRoutes {
  /** Each arrow's route, keyed by arrow id. */
  routes: Map<string, Point[]>;
  /** Where each arrow hops over another it crosses, keyed by the hopping arrow's id. */
  hops: Map<string, Point[]>;
}

const NO_ROUTES: ArrowRoutes = { routes: new Map(), hops: new Map() };

/**
 * Every arrow's route for a board, keyed by arrow id — a free-angle line that
 * starts and ends on the edges of its two cards — plus the points where arrows
 * cross (drawn as hops). Routed around the other cards
 * with libavoid once it has loaded and while the board is small enough; until
 * then, on a big board, and for good if libavoid ever throws, arrows are
 * straight lines between their cards — so they're always drawn. Recomputed only
 * when the document changes, not on pan/zoom.
 */
export function useArrowRoutes(doc: CanvasDocument | null): ArrowRoutes {
  const [avoid, setAvoid] = useState<Avoid | null>(null);
  const sessionRef = useRef<LibavoidSession | null>(null);
  const hasFailedRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;
    void loadLibavoid().then((loaded) => {
      if (!isCancelled) setAvoid(loaded);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
    },
    [],
  );

  return useMemo(() => {
    if (!doc) return NO_ROUTES;
    const plans = planArrows(doc.cards, doc.arrows);

    let routed: Map<string, Point[]> | null = null;
    if (avoid && !hasFailedRef.current && plans.length <= LIBAVOID_MAX_ARROWS) {
      try {
        sessionRef.current ??= new LibavoidSession(avoid);
        routed = sessionRef.current.route(doc.cards, plans);
      } catch (error: unknown) {
        console.error('libavoid routing failed; drawing straight arrows', error);
        hasFailedRef.current = true;
        // The router's state is unknown after a failure; abandon it rather than reuse it.
        sessionRef.current = null;
      }
    }

    const routes = new Map(
      plans.map((plan) => [plan.id, clipRoute(routed?.get(plan.id) ?? [plan.start, plan.end], plan.from, plan.to)]),
    );
    return { routes, hops: findArrowCrossings(routes) };
  }, [doc, avoid]);
}
