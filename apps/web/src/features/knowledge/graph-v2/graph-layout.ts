import { graphSeed } from "./graph-adapter";
import type { GraphBounds, GraphDisplayModel, GraphLayoutModel, GraphLayoutNode, GraphViewport } from "./graph-types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// First ring sits 35% closer to the focus so branch chains read as connected;
// outer rings keep a slightly wider stride.
const BAND_RADII = [0, 131, 167, 196, 219, 239, 256, 272, 287];

function radiusForDepth(depth: number, scale: number) {
  if (depth <= 0) {
    return 0;
  }
  if (depth < BAND_RADII.length) {
    return BAND_RADII[depth] * scale;
  }
  const outermost = BAND_RADII[BAND_RADII.length - 1];
  return (outermost + 30 * Math.log2(depth - 7)) * scale;
}

function boundsFor(nodes: GraphLayoutNode[]): GraphBounds {
  if (!nodes.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function layoutGraph(display: GraphDisplayModel, viewport: GraphViewport): GraphLayoutModel {
  const width = Math.max(320, viewport.width || 960);
  const height = Math.max(320, viewport.height || 640);
  const scale = clamp(Math.min(width / 1120, height / 720), 0.72, 1.22);
  const horizontalAspect = clamp(width / 1180, 0.84, 1.16);
  const verticalAspect = clamp(height / 720, 0.82, 1.16);
  const nodes: GraphLayoutNode[] = display.nodes.map((node) => {
    if (node.isFocus || node.depth === 0) {
      return { ...node, x: 0, y: 0, radius: 0, angle: node.baseAngle };
    }
    const organicJitter = (graphSeed(node.id, 17) - 0.5) * 0.075;
    const radiusJitter = (graphSeed(node.id, 29) - 0.5) * 0.08;
    const angle = node.baseAngle + organicJitter;
    const radius = radiusForDepth(node.radialBand, scale) * (1 + radiusJitter);
    return {
      ...node,
      angle,
      radius,
      x: Math.cos(angle) * radius * horizontalAspect,
      y: Math.sin(angle) * radius * verticalAspect,
    };
  });

  return {
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    bounds: boundsFor(nodes),
    viewport: { width, height },
    scale,
  };
}

export interface LocalHandoffTargets {
  targets: Record<string, [number, number]>;
  influence: Record<string, number>;
  affectedIds: string[];
}

// Build a reversible, symmetric displacement field over the current display
// tree. A and B exchange slots exactly; nearby display-tree nodes follow by
// a small falloff amount so local edges do not tear during the handoff.
export function buildLocalHandoffTargets(
  points: Readonly<Record<string, [number, number]>>,
  edges: ReadonlyArray<{ source: string; target: string }>,
  fromId: string,
  toId: string,
): LocalHandoffTargets {
  const from = points[fromId];
  const to = points[toId];
  if (!from || !to || fromId === toId) {
    return { targets: {}, influence: {}, affectedIds: [] };
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const outgoing = adjacency.get(edge.source) ?? [];
    outgoing.push(edge.target);
    adjacency.set(edge.source, outgoing);
    const incoming = adjacency.get(edge.target) ?? [];
    incoming.push(edge.source);
    adjacency.set(edge.target, incoming);
  }

  const distances = (startId: string) => {
    const result = new Map<string, number>([[startId, 0]]);
    const queue: string[] = [startId];
    while (queue.length) {
      const current = queue.shift()!;
      const nextDistance = (result.get(current) ?? 0) + 1;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (result.has(neighbor)) continue;
        result.set(neighbor, nextDistance);
        queue.push(neighbor);
      }
    }
    return result;
  };

  const fromDistance = distances(fromId);
  const toDistance = distances(toId);
  const falloff = (distance: number) => {
    if (distance <= 0) return 1;
    if (distance === 1) return 0.48;
    if (distance === 2) return 0.14;
    return 0;
  };
  const delta: [number, number] = [to[0] - from[0], to[1] - from[1]];
  const targets: Record<string, [number, number]> = {};
  const influence: Record<string, number> = {};
  const affectedIds: string[] = [];
  for (const id of Object.keys(points)) {
    const point = points[id];
    if (!point) continue;
    let coefficient = 0;
    let target: [number, number];
    if (id === fromId) {
      coefficient = 1;
      target = [to[0], to[1]];
    } else if (id === toId) {
      coefficient = -1;
      target = [from[0], from[1]];
    } else {
      const a = falloff(fromDistance.get(id) ?? Number.POSITIVE_INFINITY);
      const b = falloff(toDistance.get(id) ?? Number.POSITIVE_INFINITY);
      coefficient = Math.max(-0.42, Math.min(0.42, a - b));
      if (Math.abs(coefficient) < 0.002) continue;
      target = [point[0] + coefficient * delta[0], point[1] + coefficient * delta[1]];
    }
    targets[id] = target;
    influence[id] = coefficient;
    affectedIds.push(id);
  }
  return { targets, influence, affectedIds };
}

// Rotate the CURRENT live node positions around the current focus pivot by a
// step angle. The radial layout is only built on creation/structural changes,
// so orbiting must use the rendered coordinates instead of the base layout.
export function orbitPositions(
  points: Readonly<Record<string, [number, number]>>,
  pivot: [number, number],
  angle: number,
) {
  const positions: Record<string, [number, number]> = {};
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [pivotX, pivotY] = pivot;
  for (const [id, [x, y]] of Object.entries(points)) {
    const dx = x - pivotX;
    const dy = y - pivotY;
    positions[id] = [
      pivotX + dx * cos - dy * sin,
      pivotY + dx * sin + dy * cos,
    ];
  }
  return positions;
}
