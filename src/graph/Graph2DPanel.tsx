import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useGraphLayout } from './useGraphLayout';

interface Graph2DPanelProps {
  vaultRoot: string;
  activePath: string | null;
  /** Called with a vault-relative path when a node is clicked. */
  onSelect: (path: string) => void;
}

const NODE_COLOR = '#5fd0ff';
const ACTIVE_COLOR = '#b7ff5f';
const HOVER_COLOR = '#ffffff';
const NODE_RADIUS = 2.6;
const HOVER_RADIUS = 4.2;
const EDGE_STROKE_WIDTH = 0.35;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.15;
// Headroom around the layout's own bounding box so an edge node isn't
// clipped flush against the pane's border at the default (unzoomed) fit.
const FIT_PADDING_RATIO = 0.15;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Main-panel view of the vault as a plain, flat 2D graph — Obsidian's own
 *  graph view. Replaces the editor when 2D graph mode is toggled on, the
 *  same way the existing `GraphPanel` (3D, spends its third axis on
 *  creation time) does; this one shares its node positions with that view
 *  instead of duplicating the layout work — same `useGraphLayout` force
 *  simulation, warm-started from the same persisted `graph_x`/`graph_y`
 *  properties — just projected flat instead of orbited in 3D.
 *
 *  Zoom/wheel and drag/pan are hand-rolled against the SVG `viewBox` rather
 *  than pulling in a pan-zoom library: `zoom`/`pan` are offsets layered on
 *  top of `fitBox` (the layout's own bounding box), not a replacement for
 *  it, so panning/zooming never fights a later layout recompute (e.g. a new
 *  note shifting the force simulation) — that only moves `fitBox` itself,
 *  which the current pan/zoom still applies on top of. */
export function Graph2DPanel({ vaultRoot, activePath, onSelect }: Graph2DPanelProps) {
  const { nodes, edges, isLoading } = useGraphLayout(vaultRoot);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const fitBox = useMemo(() => {
    if (nodes.length === 0) return { cx: 0, cy: 0, size: 100 };
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const size = Math.max(maxX - minX, maxY - minY, 1) * (1 + FIT_PADDING_RATIO * 2);
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, size };
  }, [nodes]);

  const effectiveSize = fitBox.size / zoom;
  const viewMinX = fitBox.cx - effectiveSize / 2 + pan.x;
  const viewMinY = fitBox.cy - effectiveSize / 2 + pan.y;

  function screenDeltaToGraph(dxScreen: number, dyScreen: number): { dx: number; dy: number } {
    const widthPx = svgRef.current?.getBoundingClientRect().width || 1;
    const scaleFactor = effectiveSize / widthPx;
    return { dx: dxScreen * scaleFactor, dy: dyScreen * scaleFactor };
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    // The cursor's graph-space position before the zoom changes, so the
    // zoom stays anchored under the pointer instead of always the pane's
    // center — matches scroll-to-zoom everywhere else (maps, PDF viewers).
    const fx = (event.clientX - rect.left) / rect.width;
    const fy = (event.clientY - rect.top) / rect.height;
    const graphXBefore = viewMinX + fx * effectiveSize;
    const graphYBefore = viewMinY + fy * effectiveSize;

    const nextZoom = clamp(zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), MIN_ZOOM, MAX_ZOOM);
    const nextEffectiveSize = fitBox.size / nextZoom;
    setZoom(nextZoom);
    setPan({
      x: graphXBefore - fx * nextEffectiveSize - (fitBox.cx - nextEffectiveSize / 2),
      y: graphYBefore - fy * nextEffectiveSize - (fitBox.cy - nextEffectiveSize / 2),
    });
  }

  function handleBackgroundPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    // A node/edge's own onClick handles that case — only a drag started on
    // empty background pans the view.
    if (event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dxScreen = event.clientX - drag.lastX;
    const dyScreen = event.clientY - drag.lastY;
    dragState.current = { ...drag, lastX: event.clientX, lastY: event.clientY };
    const { dx, dy } = screenDeltaToGraph(dxScreen, dyScreen);
    setPan((current) => ({ x: current.x - dx, y: current.y - dy }));
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-fg-faint" style={{ fontSize: '0.78rem' }}>
        building graph…
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-fg-faint" style={{ fontSize: '0.78rem' }}>
        no notes yet
      </div>
    );
  }

  const hoveredNode = hoveredId ? (nodeById.get(hoveredId) ?? null) : null;

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`${viewMinX} ${viewMinY} ${effectiveSize} ${effectiveSize}`}
        className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {edges.map((edge) => {
          const source = nodeById.get(edge.sourceId);
          const target = nodeById.get(edge.targetId);
          if (!source || !target) return null;
          return (
            <line
              key={`${edge.sourceId}-${edge.targetId}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="white"
              strokeOpacity={0.18}
              strokeWidth={EDGE_STROKE_WIDTH}
            />
          );
        })}
        {nodes.map((node) => {
          const isActive = node.path === activePath;
          const isHovered = hoveredId === node.id;
          return (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={isHovered ? HOVER_RADIUS : NODE_RADIUS}
              fill={isActive ? ACTIVE_COLOR : isHovered ? HOVER_COLOR : NODE_COLOR}
              className="cursor-pointer"
              onPointerOver={() => setHoveredId(node.id)}
              onPointerOut={() => setHoveredId((current) => (current === node.id ? null : current))}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(node.path);
              }}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-3">
        <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
          [graph]
        </span>
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
      {hoveredNode && (
        <div
          className="pointer-events-none absolute bottom-3 left-3 max-w-[60%] truncate border border-border bg-bg px-2 py-1 text-fg-prominent"
          style={{ fontSize: '0.75rem' }}
        >
          {hoveredNode.title}
        </div>
      )}
    </div>
  );
}
