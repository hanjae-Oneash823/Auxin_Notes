import { useEffect, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceSimulation, forceX, forceY, type Simulation, type SimulationNodeDatum } from 'd3-force';
import type { StickyNote } from '../db/queries/sticky';
import { useStickyStore } from './stickyStore';

export interface BoardPosition {
  x: number;
  y: number;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
}

/** Roughly a card's footprint plus breathing room — collision uses a single
 *  radius per note rather than per-note dimensions, close enough for an
 *  "organic cluster" feel without tracking each card's actual rendered size. */
const COLLIDE_RADIUS = 110;
const DRAG_ALPHA_TARGET = 0.3;

/**
 * A live, continuously-running force simulation (unlike `useGraphLayout.ts`'s
 * one-shot 300-tick batch) driving draggable sticky-note positions. Follows
 * the standard d3-force drag recipe: dragging raises `alphaTarget` and pins
 * the dragged node's `fx`/`fy` to the pointer every frame (other notes get
 * pushed out of the way by collision); releasing drops `alphaTarget` back to
 * 0 and clears the pin, letting the note settle under its own last velocity.
 */
export function useStickyBoardLayout(notes: StickyNote[]) {
  const setBoardPosition = useStickyStore((state) => state.setBoardPosition);
  const [positions, setPositions] = useState<Map<string, BoardPosition>>(new Map());
  const simulationRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  // Only the id *set* should rebuild/reheat the simulation — `notes` itself
  // gets a fresh array reference on every store mutation (immutable-update
  // pattern), including ones that don't add/remove a note (a color change,
  // a checklist toggle, our own drag-end position write), and reheating the
  // simulation on those would jitter the whole board for no reason.
  const noteIdsKey = notes.map((note) => note.id).join(',');

  useEffect(() => {
    const existingById = new Map(nodesRef.current.map((node) => [node.id, node]));
    const nextNodes: SimNode[] = notes.map((note) => {
      const existing = existingById.get(note.id);
      if (existing) return existing;
      return {
        id: note.id,
        x: note.boardX ?? (Math.random() - 0.5) * 320,
        y: note.boardY ?? (Math.random() - 0.5) * 320,
      };
    });
    nodesRef.current = nextNodes;

    if (!simulationRef.current) {
      simulationRef.current = forceSimulation<SimNode>(nextNodes)
        .force('collide', forceCollide(COLLIDE_RADIUS))
        .force('center', forceCenter(0, 0))
        .force('x', forceX(0).strength(0.02))
        .force('y', forceY(0).strength(0.02))
        .on('tick', () => {
          setPositions(new Map(nodesRef.current.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }])));
        });
    } else {
      simulationRef.current.nodes(nextNodes);
      simulationRef.current.alpha(0.4).restart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteIdsKey]);

  useEffect(() => {
    return () => {
      simulationRef.current?.stop();
      simulationRef.current = null;
    };
  }, []);

  function findNode(id: string): SimNode | undefined {
    return nodesRef.current.find((node) => node.id === id);
  }

  function beginDrag(id: string) {
    simulationRef.current?.alphaTarget(DRAG_ALPHA_TARGET).restart();
    const node = findNode(id);
    if (!node) return;
    node.fx = node.x;
    node.fy = node.y;
  }

  function dragTo(id: string, x: number, y: number) {
    const node = findNode(id);
    if (!node) return;
    node.fx = x;
    node.fy = y;
  }

  function endDrag(id: string) {
    simulationRef.current?.alphaTarget(0);
    const node = findNode(id);
    if (!node) return;
    const x = node.fx ?? node.x ?? 0;
    const y = node.fy ?? node.y ?? 0;
    node.fx = null;
    node.fy = null;
    setBoardPosition(id, x, y, true);
  }

  return { positions, beginDrag, dragTo, endDrag };
}
