import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Billboard, Html, Instance, Instances, Line, Text } from '@react-three/drei';
import { OrthographicCamera, type Group } from 'three';
import { computeCameraDistance, FixedAxisControls } from './FixedAxisControls';
import { useGraphLayout, type GraphLayoutNode } from './useGraphLayout';

interface GraphPanelProps {
  vaultRoot: string;
  activePath: string | null;
  /** Called with a vault-relative path when a node is clicked. */
  onSelect: (path: string) => void;
}

const NODE_COLOR = '#5fd0ff';
const ACTIVE_COLOR = '#b7ff5f';
const HOVER_COLOR = '#ffffff';
const WIGGLE_AMOUNT = 0.9;
const WIGGLE_SPEED = 0.6;
const NODE_BASE_RADIUS = 2.2; // matches the sphereGeometry radius below
const NODE_PIXEL_RADIUS = 5; // constant on-screen size regardless of zoom
const HOVER_SCALE = 1.6;

/** Just enough of drei's underlying Line2 object to update its geometry
 *  imperatively — avoids depending on three-stdlib's types directly, which
 *  isn't a declared dependency of this project (only a transitive one of
 *  @react-three/drei, unresolvable under pnpm's strict node_modules). */
interface EdgeLine {
  geometry: { setPositions: (positions: number[]) => void };
}

function formatCreated(created: string): string {
  const date = new Date(created);
  return Number.isNaN(date.getTime()) ? created : date.toLocaleDateString();
}

function GraphScene({
  nodes,
  edges,
  activePath,
  onSelect,
}: {
  nodes: GraphLayoutNode[];
  edges: { sourceId: string; targetId: string }[];
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const hoveredNode = hoveredId ? (nodeById.get(hoveredId) ?? null) : null;

  // Per-node phase offset so the wiggle doesn't move every dot in lockstep.
  const wigglePhase = useMemo(() => new Map(nodes.map((node) => [node.id, Math.random() * Math.PI * 2])), [nodes]);
  const instanceRefs = useRef(new Map<string, Group>());
  const edgeRefs = useRef(new Map<string, EdgeLine>());

  function wiggleOffset(nodeId: string, t: number): number {
    const phase = wigglePhase.get(nodeId) ?? 0;
    return Math.sin(t * WIGGLE_SPEED + phase) * WIGGLE_AMOUNT;
  }

  // Mutating instance transforms directly (rather than React state) keeps
  // this off the render path — frameloop="demand" still only renders when
  // this runs, but nothing here fights React for ownership of node position.
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Orthographic screen size = world size × zoom, so without this a node
    // sized to look right at the default zoom shrinks to nothing zoomed out
    // and swells to fill the screen zoomed in. Scaling by 1/zoom cancels
    // that out, holding the on-screen radius constant.
    const { camera } = state;
    const zoomCompensation = camera instanceof OrthographicCamera ? 1 / camera.zoom : 1;
    const baseScale = (NODE_PIXEL_RADIUS * zoomCompensation) / NODE_BASE_RADIUS;
    for (const node of nodes) {
      const instance = instanceRefs.current.get(node.id);
      if (!instance) continue;
      const offset = wiggleOffset(node.id, t);
      instance.position.set(node.x, node.z + offset, node.y);
      instance.scale.setScalar(baseScale * (hoveredId === node.id ? HOVER_SCALE : 1));
    }
    // Edges read each endpoint's live wiggle offset here too, instead of
    // the static base position — otherwise they'd stay put while the nodes
    // they connect bob around, visibly detaching from them.
    for (const edge of edges) {
      const source = nodeById.get(edge.sourceId);
      const target = nodeById.get(edge.targetId);
      const line = edgeRefs.current.get(`${edge.sourceId}-${edge.targetId}`);
      if (!source || !target || !line) continue;
      line.geometry.setPositions([
        source.x,
        source.z + wiggleOffset(source.id, t),
        source.y,
        target.x,
        target.z + wiggleOffset(target.id, t),
        target.y,
      ]);
    }
    state.invalidate();
  });

  // node.z is the time axis rendered along world Y (see the position prop
  // below) — a visible spine through it is the whole point of this feature,
  // so it needs an actual on-screen reference, not just implicit height.
  const timeValues = nodes.map((node) => node.z);
  const minTime = Math.min(...timeValues);
  const maxTime = Math.max(...timeValues);
  const axisPadding = Math.max((maxTime - minTime) * 0.06, 3);

  return (
    <>
      <Line
        points={[
          [0, minTime - axisPadding, 0],
          [0, maxTime + axisPadding, 0],
        ]}
        color="#ff5f5f"
        transparent
        opacity={0.9}
        lineWidth={2.5}
      />
      <Billboard position={[0, maxTime + axisPadding, 0]}>
        <Text fontSize={3.2} color="#ff5f5f" fillOpacity={0.9} anchorX="center" anchorY="bottom">
          [now]
        </Text>
      </Billboard>
      <Billboard position={[0, minTime - axisPadding, 0]}>
        <Text fontSize={3.2} color="#ff5f5f" fillOpacity={0.9} anchorX="center" anchorY="top">
          [past]
        </Text>
      </Billboard>
      <Instances limit={nodes.length}>
        <sphereGeometry args={[2.2, 16, 16]} />
        <meshBasicMaterial />
        {nodes.map((node) => (
          <Instance
            key={node.id}
            ref={(instance: Group | null) => {
              if (instance) instanceRefs.current.set(node.id, instance);
              else instanceRefs.current.delete(node.id);
            }}
            // three.js treats Y as the up axis, not Z — node.z (creation
            // rank) goes in the Y slot so time reads as height on screen,
            // per the app's own axis convention (x/y are the force layout).
            // Overridden every frame by the wiggle in useFrame above; set
            // here too so the very first paint isn't at the origin.
            position={[node.x, node.z, node.y]}
            color={node.path === activePath ? ACTIVE_COLOR : hoveredId === node.id ? HOVER_COLOR : NODE_COLOR}
            // scale is set imperatively in useFrame above (zoom compensation
            // + hover boost combined) — a JSX prop here would just be
            // overwritten every frame.
            onPointerOver={(event) => {
              event.stopPropagation();
              setHoveredId(node.id);
            }}
            onPointerOut={() => setHoveredId((current) => (current === node.id ? null : current))}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(node.path);
            }}
          />
        ))}
      </Instances>
      {edges.map((edge) => {
        const source = nodeById.get(edge.sourceId);
        const target = nodeById.get(edge.targetId);
        if (!source || !target) return null;
        const edgeKey = `${edge.sourceId}-${edge.targetId}`;
        return (
          <Line
            key={edgeKey}
            ref={(line: EdgeLine | null) => {
              if (line) edgeRefs.current.set(edgeKey, line);
              else edgeRefs.current.delete(edgeKey);
            }}
            points={[
              [source.x, source.z, source.y],
              [target.x, target.z, target.y],
            ]}
            color="white"
            transparent
            opacity={0.25}
            lineWidth={1}
          />
        );
      })}
      {hoveredNode && (
        <Html position={[hoveredNode.x, hoveredNode.z, hoveredNode.y]} center style={{ pointerEvents: 'none' }}>
          <div
            className="-translate-y-4 whitespace-nowrap border border-border bg-bg px-2 py-1"
            style={{ fontSize: '0.7rem' }}
          >
            <div className="text-fg-prominent">{hoveredNode.title}</div>
            <div className="text-fg-faint" style={{ fontSize: '0.62rem' }}>
              {formatCreated(hoveredNode.created)}
            </div>
          </div>
        </Html>
      )}
    </>
  );
}

/** Main-panel view of the vault as a 3D graph — X/Y from a force-directed
 *  layout of note links, Z from creation order. Replaces the editor when
 *  graph mode is toggled on; click a node to open it (and leave graph mode). */
export function GraphPanel({ vaultRoot, activePath, onSelect }: GraphPanelProps) {
  const { nodes, edges, isLoading } = useGraphLayout(vaultRoot);

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

  // Render-space extent (x, z-as-up, y — same mapping GraphScene uses) so
  // the camera starts zoomed to fit the whole graph from outside it, for
  // any vault size, instead of a fixed distance tuned for one test vault.
  const fitExtent = Math.max(...nodes.map((node) => Math.hypot(node.x, node.z, node.y)), 1);
  // Fog gives the otherwise-flat isometric projection an actual depth cue —
  // nodes fade toward the background the farther they sit from the camera
  // along its view direction. Centered on the camera's fixed distance so it
  // starts fading right around where the content actually is, not before
  // or after it regardless of vault size.
  const cameraDistance = computeCameraDistance(fitExtent);
  const fogNear = Math.max(cameraDistance - fitExtent * 1.5, 0.1);
  const fogFar = cameraDistance + fitExtent * 1.5;

  return (
    <div className="h-full w-full">
      <Canvas orthographic frameloop="demand" camera={{ near: 0.1, far: 5000 }}>
        <fog attach="fog" args={['#000000', fogNear, fogFar]} />
        <GraphScene nodes={nodes} edges={edges} activePath={activePath} onSelect={onSelect} />
        <FixedAxisControls fitExtent={fitExtent} />
      </Canvas>
    </div>
  );
}
