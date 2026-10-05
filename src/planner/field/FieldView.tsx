import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlannerNode } from '../../db/queries/planner/types';
import { useSettingsStore } from '../../app/settings/settingsStore';
import { NodeDetailPanel } from '../NodeDetailPanel';
import type { NodeDefaults } from '../NewNodeModal';
import { useArcVisibilityStore } from '../arcVisibilityStore';
import { isMissed, isOverdue, plannedDateOf } from '../nodeDerived';
import { usePlannerStore } from '../plannerStore';
import { FieldTooltip } from './FieldTooltip';
import { readFieldPalette, type FieldPalette } from './fieldPalette';
import { NO_ARC_ID, TOP_BOUND, bandAt, buildColumns, columnAt, launchParticle, rowAt, syncParticles, tick, type FieldParticle } from './fieldPhysics';
import { drawField } from './fieldRender';

const HIT_RADIUS_PX = 16;
const FADED_OPACITY = 0.3;
const FUTURE_PAGE_DAYS = 5;
const STATUS_MS = 1800;
const MAX_FRAME_DPR = 2;
const DETAIL_WIDTH_PX = 340;
const EDGE_PX = 8;

interface FieldViewProps {
  /** Opens the new-node dialog with the clicked cell's day, row and kind filled in. */
  onCreate: (defaults: NodeDefaults) => void;
  onEdit: (node: PlannerNode) => void;
}

function findNodeAt(particles: readonly FieldParticle[], x: number, y: number): FieldParticle | null {
  let best: FieldParticle | null = null;
  let bestDistance = HIT_RADIUS_PX;
  for (const particle of particles) {
    if (particle.opacity < FADED_OPACITY) continue;
    const distance = Math.hypot(particle.x - x, particle.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = particle;
    }
  }
  return best;
}

function pointerPosition(event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top, rect };
}

const NAV_BUTTON = 'rounded-tab border border-border-subtle px-2.5 py-0.5 text-fg-muted transition-colors duration-panel ease-panel enabled:hover:border-border-strong enabled:hover:text-fg-prominent disabled:opacity-30';

/** Mycelium's "field" view: every open node is a dot floating in its day's column and its
 *  importance row. Click a dot to pick it up, click a cell to drop it there (reschedules it
 *  and sets its importance); click empty space to add a node; double-click for details. */
export function FieldView({ onCreate, onEdit }: FieldViewProps) {
  const nodes = usePlannerStore((state) => state.nodes);
  const arcs = usePlannerStore((state) => state.arcs);
  const editNode = usePlannerStore((state) => state.editNode);
  const hiddenArcIds = useArcVisibilityStore((state) => state.hiddenArcIds);
  const toggleArc = useArcVisibilityStore((state) => state.toggleArc);
  const themeId = useSettingsStore((state) => state.themeId);
  const fontFamilyId = useSettingsStore((state) => state.fontFamilyId);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Map<string, FieldParticle>>(new Map());
  const paletteRef = useRef<FieldPalette | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const moveZoneRef = useRef(-1);
  const moveBandRef = useRef(-1);
  const hoverCellZoneRef = useRef(-1);
  const hoverCellRowRef = useRef(-1);
  const cursorRef = useRef({ x: 0, y: 0, isActive: false });
  const statusTimerRef = useRef<number | null>(null);

  const [futureOffset, setFutureOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: string; x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ node: PlannerNode; x: number; y: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const hasOverdue = useMemo(() => nodes.some((node) => isOverdue(node) || isMissed(node)), [nodes]);
  const columns = useMemo(() => buildColumns(futureOffset, hasOverdue), [futureOffset, hasOverdue]);
  const isReducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const detailNode = detail ? nodes.find((node) => node.id === detail.id) ?? null : null;

  // The animation loop is mounted once; these mirrors keep it reading fresh values without restarting.
  const nodesRef = useRef(nodes);
  const columnsRef = useRef(columns);
  const arcsRef = useRef(arcs);
  const hiddenRef = useRef(hiddenArcIds);
  const selectedRef = useRef(selectedId);
  useEffect(() => { nodesRef.current = nodes; columnsRef.current = columns; arcsRef.current = arcs; hiddenRef.current = hiddenArcIds; selectedRef.current = selectedId; });

  useEffect(() => {
    paletteRef.current = readFieldPalette();
  }, [themeId, fontFamilyId]);

  useEffect(() => () => {
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frameId = 0;
    let isRunning = true;

    function frame() {
      if (!isRunning || !canvas || !ctx) return;
      const palette = paletteRef.current ?? (paletteRef.current = readFieldPalette());
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_FRAME_DPR);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width && height) {
        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        syncParticles(particlesRef.current, nodesRef.current, columnsRef.current, width, height);
        const particles = Array.from(particlesRef.current.values());
        tick(particles, columnsRef.current.length, hiddenRef.current, selectedRef.current, width, height, isReducedMotion, performance.now());
        drawField(ctx, width, height, particles, {
          columns: columnsRef.current,
          arcs: arcsRef.current,
          palette,
          hoverNodeId: hoverIdRef.current,
          selectedNodeId: selectedRef.current,
          moveZone: moveZoneRef.current,
          moveBand: moveBandRef.current,
          hoverCellZone: hoverCellZoneRef.current,
          hoverCellRow: hoverCellRowRef.current,
          cursor: cursorRef.current,
          isReducedMotion,
        });
      }
      frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
    return () => {
      isRunning = false;
      cancelAnimationFrame(frameId);
    };
  }, [isReducedMotion]);

  useEffect(() => {
    if (!detail) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setDetail(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail]);

  function showStatus(text: string) {
    setStatus(text);
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => setStatus(null), STATUS_MS);
  }

  function particleList(): FieldParticle[] {
    return Array.from(particlesRef.current.values());
  }

  function clearMoveHover() {
    moveZoneRef.current = -1;
    moveBandRef.current = -1;
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y, rect } = pointerPosition(event, canvas);
    cursorRef.current = { x, y, isActive: true };
    const hit = findNodeAt(particleList(), x, y);
    hoverIdRef.current = hit ? hit.node.id : null;
    setTooltip(hit ? { node: hit.node, x: rect.left + hit.x, y: rect.top + hit.y } : null);
    if (y < TOP_BOUND) {
      hoverCellZoneRef.current = -1;
      hoverCellRowRef.current = -1;
    } else {
      hoverCellZoneRef.current = columnAt(x, canvas.clientWidth, columns.length);
      hoverCellRowRef.current = rowAt(y, canvas.clientHeight);
    }
    if (selectedId) {
      moveZoneRef.current = columnAt(x, canvas.clientWidth, columns.length);
      moveBandRef.current = bandAt(y, canvas.clientHeight) ?? -1;
      canvas.style.cursor = hit ? 'pointer' : 'crosshair';
    } else {
      clearMoveHover();
      canvas.style.cursor = hit ? 'pointer' : 'default';
    }
  }

  function handlePointerLeave() {
    hoverIdRef.current = null;
    clearMoveHover();
    hoverCellZoneRef.current = -1;
    hoverCellRowRef.current = -1;
    cursorRef.current = { ...cursorRef.current, isActive: false };
    setTooltip(null);
  }

  /** Drops a picked-up node into a cell: moves it to that day (unless that is past its deadline) and sets its importance, in one save. */
  function commitMove(particle: FieldParticle, zone: number, band: 0 | 1) {
    const { node } = particle;
    const column = columns[zone];
    if (!column || column.isOverdue) return; // nothing can be scheduled into OOPS
    const isPastDue = node.dueAt !== null && column.key > node.dueAt.slice(0, 10);
    const isMoved = !isPastDue && plannedDateOf(node) !== column.key;
    const isReweighed = band !== node.importanceLevel;
    if (!isMoved && !isReweighed) return;
    void editNode(node.id, {
      ...(isMoved && { plannedStartAt: `${column.key}${node.plannedStartAt?.slice(10) ?? ''}` }),
      ...(isReweighed && { importanceLevel: band }),
    });
    launchParticle(particle, performance.now());
    showStatus(`"${node.title}" → ${column.label}${band === 1 ? ' · marked important' : ' · marked normal'}`);
  }

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = pointerPosition(event, canvas);
    const hit = findNodeAt(particleList(), x, y);
    if (hit) {
      if (hit.node.isLocked || hit.node.isRoutine) return; // still openable by double-click, just not movable
      setSelectedId((current) => (current === hit.node.id ? null : hit.node.id));
      return;
    }
    const zone = columnAt(x, canvas.clientWidth, columns.length);
    const band = bandAt(y, canvas.clientHeight);
    if (selectedId) {
      const particle = particlesRef.current.get(selectedId);
      if (particle && band !== null) commitMove(particle, zone, band); // clicking the events row cancels the move
      setSelectedId(null);
      clearMoveHover();
      return;
    }
    const column = columns[zone];
    if (y < TOP_BOUND || !column || column.isOverdue) return;
    onCreate({ plannedDate: column.key, isImportant: band === 1, kind: band === null ? 'event' : 'task' });
  }

  function handleDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y, rect } = pointerPosition(event, canvas);
    const hit = findNodeAt(particleList(), x, y);
    if (!hit) return;
    setSelectedId(null);
    setDetail({ id: hit.node.id, x: rect.left + hit.x, y: rect.top + hit.y });
    setTooltip(null);
  }

  const detailLeft = detail ? Math.max(EDGE_PX, Math.min(detail.x - DETAIL_WIDTH_PX / 2, window.innerWidth - DETAIL_WIDTH_PX - EDGE_PX)) : 0;
  const detailTop = detail ? Math.min(detail.y + 20, window.innerHeight - 160) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        <button type="button" disabled={futureOffset === 0} onClick={() => setFutureOffset((offset) => Math.max(0, offset - FUTURE_PAGE_DAYS))} className={NAV_BUTTON}>‹ prev</button>
        <span className="min-w-[6rem] text-center text-fg-faint" style={{ fontSize: '0.78rem' }}>
          {futureOffset === 0 ? `next ${FUTURE_PAGE_DAYS} days` : `+${futureOffset + 1} – +${futureOffset + FUTURE_PAGE_DAYS}`}
        </span>
        <button type="button" onClick={() => setFutureOffset((offset) => offset + FUTURE_PAGE_DAYS)} className={NAV_BUTTON}>next ›</button>
      </div>

      <div className="relative h-[560px] overflow-hidden rounded-tab border border-border-subtle">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full"
          style={{ touchAction: 'none' }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        />
        <div className="pointer-events-none absolute bottom-3 left-3.5 transition-opacity duration-300" style={{ color: '#f59e0b', fontSize: '0.78rem', opacity: status ? 1 : 0 }}>{status}</div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {arcs.filter((arc) => arc.status === 'active').map((arc) => (
          <button
            key={arc.id}
            type="button"
            onClick={() => toggleArc(arc.id)}
            title="show or dim this arc's nodes"
            className="flex items-center gap-1.5 rounded-tab border border-border-subtle px-2.5 py-1 text-fg-muted transition-opacity duration-panel ease-panel hover:text-fg-prominent"
            style={{ fontSize: '0.74rem', opacity: hiddenArcIds.includes(arc.id) ? 0.35 : 1 }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: arc.colorHex }} />
            {arc.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => toggleArc(NO_ARC_ID)}
          title="show or dim nodes with no arc"
          className="rounded-tab border border-border-subtle px-2.5 py-1 text-fg-faint transition-opacity duration-panel ease-panel hover:text-fg-prominent"
          style={{ fontSize: '0.74rem', opacity: hiddenArcIds.includes(NO_ARC_ID) ? 0.35 : 1 }}
        >
          no arc
        </button>
      </div>
      <p className="text-fg-faint" style={{ fontSize: '0.72rem' }}>
        click a dot to pick it up · click a cell to move it there · click empty space to add · double-click for details
      </p>

      {tooltip && !detail && <FieldTooltip node={tooltip.node} anchorX={tooltip.x} anchorY={tooltip.y} />}
      {detail && detailNode && (
        <div className="fixed inset-0 z-50" onMouseDown={() => setDetail(null)}>
          <div
            onMouseDown={(event) => event.stopPropagation()}
            className="fixed overflow-y-auto rounded-tab border border-border bg-bg"
            style={{ left: detailLeft, top: detailTop, width: DETAIL_WIDTH_PX, maxHeight: `calc(100vh - ${detailTop + EDGE_PX}px)`, boxShadow: 'var(--shadow-float)', fontSize: '0.85rem' }}
          >
            <NodeDetailPanel node={detailNode} onEdit={() => { setDetail(null); onEdit(detailNode); }} onClose={() => setDetail(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
