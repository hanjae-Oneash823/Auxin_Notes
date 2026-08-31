import { useEffect, useState } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from 'd3-force';
import { getDb } from '../db/client';
import { getGraphEdges, getGraphNodes, getStoredPositions, savePositions } from '../db/queries/graph';
import { useVaultStore } from '../vault/vaultStore';

export interface GraphLayoutNode {
  id: string;
  path: string;
  title: string;
  created: string;
  x: number;
  y: number;
  z: number;
}

export interface GraphLayoutEdge {
  sourceId: string;
  targetId: string;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  path: string;
  title: string;
  created: string;
}

interface SimLink {
  source: string;
  target: string;
}

const Z_SPACING = 6;
const SIMULATION_TICKS = 300;

/** Rank-order Z (evenly spaced by creation order) + a force-directed X/Y
 *  layout from the link graph, warm-started from positions persisted in
 *  `properties` so the layout doesn't reshuffle on every load. */
export function useGraphLayout(vaultRoot: string) {
  const [nodes, setNodes] = useState<GraphLayoutNode[]>([]);
  const [edges, setEdges] = useState<GraphLayoutEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const syncVersion = useVaultStore((state) => state.syncVersion);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      const db = await getDb(vaultRoot);
      const [graphNodes, graphEdges, stored] = await Promise.all([
        getGraphNodes(db),
        getGraphEdges(db),
        getStoredPositions(db),
      ]);
      if (cancelled) return;

      if (graphNodes.length === 0) {
        setNodes([]);
        setEdges([]);
        setIsLoading(false);
        return;
      }

      const simNodes: SimNode[] = graphNodes.map((node) => {
        const seed = stored.get(node.id);
        return {
          id: node.id,
          path: node.path,
          title: node.title,
          created: node.created,
          x: seed?.x ?? (Math.random() - 0.5) * 40,
          y: seed?.y ?? (Math.random() - 0.5) * 40,
        };
      });
      const simLinks: SimLink[] = graphEdges.map((edge) => ({ source: edge.sourceId, target: edge.targetId }));

      const simulation = forceSimulation(simNodes)
        .force('charge', forceManyBody().strength(-30).distanceMax(60))
        .force(
          'link',
          forceLink<SimNode, SimLink>(simLinks)
            .id((node) => node.id)
            .distance(12),
        )
        .force('collide', forceCollide(4))
        .force('center', forceCenter(0, 0))
        // Weak pull toward the origin — without it, a note with no (or one)
        // resolved link just drifts outward under unopposed repulsion, and
        // that single outlier stretches the camera's auto-fit zoom out,
        // shrinking every other note into a corner of the view.
        .force('x', forceX(0).strength(0.05))
        .force('y', forceY(0).strength(0.05))
        .stop();
      for (let i = 0; i < SIMULATION_TICKS; i++) simulation.tick();

      if (cancelled) return;

      const middle = (simNodes.length - 1) / 2;
      setNodes(
        simNodes.map((node, index) => ({
          id: node.id,
          path: node.path,
          title: node.title,
          created: node.created,
          x: node.x ?? 0,
          y: node.y ?? 0,
          z: (index - middle) * Z_SPACING,
        })),
      );
      setEdges(graphEdges);
      setIsLoading(false);

      const positions = new Map(simNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
      void savePositions(db, positions);
    })();

    return () => {
      cancelled = true;
    };
  }, [vaultRoot, syncVersion]);

  return { nodes, edges, isLoading };
}
