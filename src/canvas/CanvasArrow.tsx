import { useMemo, useState } from 'react';
import type { ArrowRoute } from './arrowPath';
import { layoutArrowLabel } from './arrowLabelLayout';
import { ARROW_HIT_WIDTH_PX, DIMMED_ARROW_OPACITY, ARROW_HOVER_STROKE_PX, ARROW_LABEL_FONT_PX, ARROW_LABEL_LINE_HEIGHT_PX, ARROW_STROKE_PX } from './canvasConstants';

interface CanvasArrowProps {
  arrowId: string;
  color: string;
  /** Unrelated to the current selection: drawn faded. */
  isDimmed: boolean;
  /** A selected card touches this arrow: dashes run along it, source to target. */
  isFlowing: boolean;
  route: ArrowRoute;
  label?: string;
  /** Double-clicking the arrow asks to edit its label. */
  onEditLabel: (arrowId: string) => void;
}

const ARROWHEAD_ID = 'canvas-arrowhead';

/** One arrow's `<marker>` id is shared across the whole board (defined once
 *  by `CanvasArrowDefs` below) rather than per-arrow, since it never varies. */
export function CanvasArrowDefs({ color }: { color: string }) {
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
        <path d="M0,0 L10,5 L0,10 z" fill={color} />
      </marker>
    </defs>
  );
}

/** One arrow, purely presentational — `route` is precomputed by
 *  `CanvasView.tsx` (via `useArrowRoutes` and `arrowPath.ts`), since routing
 *  needs every card on the board at once; a single `CanvasArrow` only ever
 *  sees its own final path. The route ends in a straight run at whatever
 *  angle the line arrives, and the marker's `orient="auto-start-reverse"`
 *  turns the arrowhead to match — no manual angle math needed. */
export function CanvasArrow({ arrowId, color, isDimmed, isFlowing, route, label, onEditLabel }: CanvasArrowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const labelLines = useMemo(() => (label ? layoutArrowLabel(label).lines : []), [label]);
  return (
    <g className="transition-opacity duration-panel ease-panel" style={{ opacity: isDimmed ? DIMMED_ARROW_OPACITY : 1 }}>
      <path
        d={route.path}
        fill="none"
        stroke={color}
        strokeWidth={isHovered ? ARROW_HOVER_STROKE_PX : ARROW_STROKE_PX}
        markerEnd={`url(#${ARROWHEAD_ID})`}
      />
      {isFlowing && (
        <path
          d={route.path}
          fill="none"
          className="canvas-arrow-flow"
          strokeWidth={ARROW_STROKE_PX + 0.5}
          strokeLinecap="round"
          // The arrow's own color pushed toward the text color: lighter on the
          // dark theme, darker on the light one, so it stands out on any arrow.
          style={{ stroke: `color-mix(in srgb, ${color} 40%, var(--fg-prominent))`, pointerEvents: 'none' }}
        />
      )}
      {/* The board's <svg> is pointer-events-none so it never blocks the
          background; this transparent, wider copy of the path opts back in
          (stroke only) so an arrow can be hovered and right-clicked —
          `CanvasView.handleContextMenu` finds it by `data-arrow-id`. */}
      <path
        d={route.path}
        fill="none"
        stroke="transparent"
        strokeWidth={ARROW_HIT_WIDTH_PX}
        data-arrow-id={arrowId}
        style={{ pointerEvents: 'stroke' }}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        onDoubleClick={() => onEditLabel(arrowId)}
      />
      {label && (
        // Wrapped to a maximum width (arrowLabelLayout.ts); the block sits just
        // above the line with its last line closest to it. The dark outline
        // (painted under the fill) keeps the text readable across other lines.
        <text
          x={route.labelPoint.x}
          textAnchor="middle"
          fill={color}
          fontSize={ARROW_LABEL_FONT_PX}
          stroke="var(--color-bg)"
          strokeWidth={4}
          strokeLinejoin="round"
          paintOrder="stroke"
          style={{ pointerEvents: 'none' }}
        >
          {labelLines.map((line, index) => (
            <tspan
              key={index}
              x={route.labelPoint.x}
              y={route.labelPoint.y - 6 - (labelLines.length - 1 - index) * ARROW_LABEL_LINE_HEIGHT_PX}
            >
              {line}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}
