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

// Translate a local radial layout so its root lands on the clicked node's
// current world position. This preserves the root anchor during navigation.
export function translateLayoutToAnchor(
  layout: GraphLayoutModel,
  anchor: [number, number],
): GraphLayoutModel {
  const [offsetX, offsetY] = anchor;
  const nodes = layout.nodes.map((node) => ({
    ...node,
    x: node.x + offsetX,
    y: node.y + offsetY,
  }));
  return {
    ...layout,
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    bounds: {
      minX: layout.bounds.minX + offsetX,
      minY: layout.bounds.minY + offsetY,
      maxX: layout.bounds.maxX + offsetX,
      maxY: layout.bounds.maxY + offsetY,
      width: layout.bounds.width,
      height: layout.bounds.height,
    },
  };
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
