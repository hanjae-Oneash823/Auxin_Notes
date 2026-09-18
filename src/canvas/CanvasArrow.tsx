import type { ArrowRoute } from './arrowPath';

interface CanvasArrowProps {
  route: ArrowRoute;
  label?: string;
}

const ARROWHEAD_ID = 'canvas-arrowhead';

/** One arrow's `<marker>` id is shared across the whole board (defined once
 *  by `CanvasArrowDefs` below) rather than per-arrow, since it never varies. */
export function CanvasArrowDefs() {
  return (
    <defs>
      <marker
        id={ARROWHEAD_ID}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-faint)" />
      </marker>
    </defs>
  );
}

/** A right-angle "flowchart" elbow, purely presentational — `route` is
 *  precomputed by `CanvasView.tsx` (via `arrowPath.ts`'s router and
 *  `arrowCrossings.ts`'s hop assignment), which needs every arrow's polyline
 *  at once to detect where two different arrows cross; a single
 *  `CanvasArrow` only ever sees its own final path. The route's final
 *  segment is always purely horizontal or vertical, so the marker's
 *  `orient="auto-start-reverse"` lands the arrowhead pointing in a clean
 *  cardinal direction — no manual angle math needed. */
export function CanvasArrow({ route, label }: CanvasArrowProps) {
  return (
    <g>
      <path d={route.path} fill="none" stroke="var(--fg-faint)" strokeWidth={2} markerEnd={`url(#${ARROWHEAD_ID})`} />
      {label && (
        <text x={route.labelPoint.x} y={route.labelPoint.y - 6} textAnchor="middle" fill="var(--fg-faint)" fontSize={12}>
          {label}
        </text>
      )}
    </g>
  );
}
