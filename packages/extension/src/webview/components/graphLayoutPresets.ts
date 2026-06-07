/**
 * Graph layout preset helpers.
 *
 * Owns the math for applying ForceAtlas2 / Circular / Hierarchical layouts to
 * the currently visible subset of the GraphView's in-memory graphology graph.
 * GraphView.tsx owns the surrounding React state (active preset, notice
 * lifecycle, Sigma refresh); this module is pure layout math + Graphology
 * library plumbing.
 */

import { DirectedGraph, type MultiDirectedGraph } from "graphology";
import { hasCycle, topologicalGenerations } from "graphology-dag";
import forceAtlas2 from "graphology-layout-forceatlas2";
import noverlap from "graphology-layout-noverlap";

import type {
  GraphLayoutSnapshot,
  HierarchicalGeneration,
  LayoutApplicationResult,
  LayoutPresetId,
  LayoutPresetOption,
} from "./graphViewTypes.js";

/**
 * Settings used when re-applying ForceAtlas2 after the user has switched to
 * Circular or Hierarchical. Kept in sync with the mount-time configuration
 * in GraphView.tsx so the visual result is consistent.
 */
const FORCE_ATLAS2_SETTINGS = {
  gravity: 1.8,
  scalingRatio: 6,
  slowDown: 3,
  barnesHutOptimize: true,
  barnesHutTheta: 0.5,
  linLogMode: true,
} as const;

/** Number of noverlap iterations per readability pass. */
const NOVERLAP_MAX_ITERATIONS = 50;

/** Anti-collision settings for the readability post-pass. */
const NOVERLAP_SETTINGS = {
  margin: 5,
  ratio: 1.0,
  gridSize: 20,
} as const;

/** Spacing between hierarchical layers (vertical) and siblings (horizontal). */
const HIERARCHICAL_LAYER_SPACING = 140;
const HIERARCHICAL_COLUMN_SPACING = 110;

/**
 * Maximum share of visible nodes a single generation may contain before the
 * Hierarchical preset rejects the projection. A graph dominated by one giant
 * layer is no more readable hierarchically than as a force layout.
 */
const HIERARCHICAL_OVERFULL_RATIO = 0.8;

export interface ApplyLayoutPresetOptions {
  /** The preset currently active before this call. Same value triggers no-op. */
  activePreset: LayoutPresetId;
  /** Identifiers of nodes the user can currently see in the canvas. */
  visibleNodeIds: ReadonlySet<string>;
  /** Identifiers of edges the user can currently see (Phase 5 hierarchical). */
  visibleEdgeIds: ReadonlySet<string>;
}

/**
 * The three layout presets exposed by the GraphView toolbar.
 * Ordering controls the dropdown menu order; do not reorder without updating
 * the spec's UI screenshot in scratch/graphview-mockup-final.html.
 */
export const LAYOUT_PRESET_OPTIONS: readonly LayoutPresetOption[] = [
  {
    id: "forceAtlas2",
    label: "ForceAtlas2",
    description: "Force-directed layout — the default; good for general overview.",
  },
  {
    id: "circular",
    label: "Circular",
    description: "Arrange every visible node on a single ring; quick structural scan.",
  },
  {
    id: "hierarchical",
    label: "Hierarchical",
    description: "Layered placement for DAG-shaped graphs; falls back when unsuitable.",
  },
];

/**
 * Capture the current `x`/`y` coordinates of every node in the graph.
 *
 * Used to preserve the prior layout before attempting a Hierarchical
 * application, so a rejection can restore the previous arrangement.
 */
export function snapshotNodePositions(graph: MultiDirectedGraph): GraphLayoutSnapshot {
  const snapshot: GraphLayoutSnapshot = new Map();
  graph.forEachNode((id, attributes) => {
    const x = typeof attributes["x"] === "number" ? attributes["x"] : 0;
    const y = typeof attributes["y"] === "number" ? attributes["y"] : 0;
    snapshot.set(id, { x, y });
  });
  return snapshot;
}

/**
 * Write the snapshot's coordinates back onto matching nodes.
 *
 * Silently skips snapshot entries for nodes that are no longer in the graph,
 * which keeps restore safe even if the visible graph changed during a
 * pending Hierarchical attempt.
 */
export function restoreNodePositions(
  graph: MultiDirectedGraph,
  snapshot: GraphLayoutSnapshot,
): void {
  for (const [nodeId, { x, y }] of snapshot) {
    if (!graph.hasNode(nodeId)) continue;
    graph.setNodeAttribute(nodeId, "x", x);
    graph.setNodeAttribute(nodeId, "y", y);
  }
}

/**
 * Count of visible nodes that actually exist in the graph. Used to detect
 * trivial graphs (<2 nodes) which return the `trivial-graph` no-op.
 */
function countLiveVisibleNodes(
  graph: MultiDirectedGraph,
  visibleNodeIds: ReadonlySet<string>,
): number {
  let count = 0;
  for (const id of visibleNodeIds) {
    if (graph.hasNode(id)) count++;
  }
  return count;
}

/**
 * Assign Circular coordinates to the visible subset of `graph`.
 *
 * Hidden nodes keep their existing positions — they are out of view so any
 * resulting position discrepancy is invisible until they become visible
 * again under a different filter setting, at which point a fresh layout
 * preset application will reposition them.
 */
function assignCircularPositions(
  graph: MultiDirectedGraph,
  visibleNodeIds: ReadonlySet<string>,
): void {
  const visible: string[] = [];
  for (const id of visibleNodeIds) {
    if (graph.hasNode(id)) visible.push(id);
  }
  if (visible.length === 0) return;

  // Radius scales with the visible-node count so small graphs stay compact
  // and large graphs have enough perimeter to keep labels distinguishable.
  const scale = Math.max(120, Math.sqrt(visible.length) * 30);
  for (let i = 0; i < visible.length; i++) {
    const angle = (2 * Math.PI * i) / visible.length;
    graph.setNodeAttribute(visible[i] as string, "x", Math.cos(angle) * scale);
    graph.setNodeAttribute(visible[i] as string, "y", Math.sin(angle) * scale);
  }
}

/** Radius of the first concentric ring; outer rings step out by this much. */
const RADIAL_RING_SPACING = 160;
/** Concentric rings to place on select (center = ring 0). 2 hops → rings 1 and 2. */
const RADIAL_MAX_RINGS = 2;

/**
 * Place a selected node's neighbourhood as concentric rings: the selected node
 * at the origin, its direct neighbours evenly spaced on the inner ring, their
 * neighbours on the next ring out. Built from the selection's pre-computed BFS
 * `hopLayers` (layer 0 = the selected node), so no traversal is recomputed here.
 *
 * The inner ring (direct neighbours of a single centre) is a star — provably
 * crossing-free. Outer rings can cross; we accept that for the added 2-hop
 * context. Each ring's nodes are angularly anchored under their nearest
 * inner-ring parent so an edge from ring N to ring N+1 stays roughly radial
 * instead of sweeping across the circle.
 *
 * Only nodes within {@link RADIAL_MAX_RINGS} hops are repositioned; everything
 * else keeps its prior coordinates (it is dimmed by the selection reducers).
 * Returns the set of node ids that were moved.
 */
export function assignRadialPositions(
  graph: MultiDirectedGraph,
  hopLayers: readonly (readonly string[])[],
): ReadonlySet<string> {
  const moved = new Set<string>();
  if (hopLayers.length === 0) return moved;

  const center = hopLayers[0]?.[0];
  if (center === undefined || !graph.hasNode(center)) return moved;
  graph.setNodeAttribute(center, "x", 0);
  graph.setNodeAttribute(center, "y", 0);
  moved.add(center);

  // Angle assigned to each placed node, so the next ring can anchor children
  // near their parent's angle (keeps ring→ring edges radial, not chordal).
  const angleOf = new Map<string, number>([[center, 0]]);

  const lastRing = Math.min(RADIAL_MAX_RINGS, hopLayers.length - 1);
  for (let ring = 1; ring <= lastRing; ring++) {
    const layer = (hopLayers[ring] ?? []).filter((id) => graph.hasNode(id));
    if (layer.length === 0) continue;
    const radius = ring * RADIAL_RING_SPACING;

    if (ring === 1) {
      // Direct neighbours: spread evenly around the full circle.
      for (let i = 0; i < layer.length; i++) {
        const angle = (2 * Math.PI * i) / layer.length;
        place(graph, layer[i]!, radius, angle, moved, angleOf);
      }
    } else {
      // Outer ring: anchor each node near an inner-ring parent's angle so the
      // connecting edge points outward. Falls back to even spread for orphans.
      const byParentAngle = layer
        .map((id) => ({ id, angle: nearestParentAngle(graph, id, angleOf) }))
        .sort((a, b) => a.angle - b.angle);
      // Nudge duplicates apart so co-anchored nodes don't stack.
      for (let i = 0; i < byParentAngle.length; i++) {
        const spread = (i - (byParentAngle.length - 1) / 2) * 0.18;
        const base = byParentAngle[i]!.angle;
        place(graph, byParentAngle[i]!.id, radius, base + spread, moved, angleOf);
      }
    }
  }

  return moved;
}

function place(
  graph: MultiDirectedGraph,
  id: string,
  radius: number,
  angle: number,
  moved: Set<string>,
  angleOf: Map<string, number>,
): void {
  graph.setNodeAttribute(id, "x", Math.cos(angle) * radius);
  graph.setNodeAttribute(id, "y", Math.sin(angle) * radius);
  moved.add(id);
  angleOf.set(id, angle);
}

/** Average angle of an outer node's already-placed neighbours, or 0 if none. */
function nearestParentAngle(
  graph: MultiDirectedGraph,
  id: string,
  angleOf: Map<string, number>,
): number {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  graph.forEachNeighbor(id, (neighbor) => {
    const a = angleOf.get(neighbor);
    if (a === undefined) return;
    // Average on the unit circle to avoid wrap-around bias near ±π.
    sumX += Math.cos(a);
    sumY += Math.sin(a);
    count += 1;
  });
  if (count === 0) return 0;
  return Math.atan2(sumY, sumX);
}

/**
 * Anti-collision readability post-pass.
 *
 * Operates on the full graph instance — hidden nodes can shift slightly but
 * they are not rendered, so the only visible effect is a more readable
 * arrangement of currently visible nodes.
 */
function runReadabilityPass(graph: MultiDirectedGraph): void {
  noverlap.assign(graph, {
    maxIterations: NOVERLAP_MAX_ITERATIONS,
    settings: NOVERLAP_SETTINGS,
  });
}

/**
 * Apply a layout preset to the current visible subgraph.
 *
 * Mutates only node coordinates; never touches edges, attributes, or graph
 * data. Returns a typed result that GraphView uses to update its toolbar
 * state and surface fallback notices for Hierarchical rejections.
 *
 * Behavior:
 * - Re-selecting the currently active preset is a safe no-op
 *   (`status: "noop", reason: "already-active"`).
 * - Selecting any preset on a graph with fewer than 2 visible nodes is a
 *   safe no-op (`status: "noop", reason: "trivial-graph"`).
 * - `circular` + `forceAtlas2` always succeed when the graph has enough
 *   visible nodes. Hierarchical may reject unsuitable (non-DAG) graphs.
 */
export function applyLayoutPreset(
  graph: MultiDirectedGraph,
  preset: LayoutPresetId,
  options: ApplyLayoutPresetOptions,
): LayoutApplicationResult {
  if (preset === options.activePreset) {
    return {
      status: "noop",
      preset,
      reason: "already-active",
      ranReadabilityPass: false,
      notice: null,
    };
  }

  if (countLiveVisibleNodes(graph, options.visibleNodeIds) < 2) {
    return {
      status: "noop",
      preset,
      reason: "trivial-graph",
      ranReadabilityPass: false,
      notice: null,
    };
  }

  switch (preset) {
    case "forceAtlas2":
      forceAtlas2.assign(graph, {
        iterations: 200,
        settings: FORCE_ATLAS2_SETTINGS,
      });
      return {
        status: "applied",
        preset: "forceAtlas2",
        ranReadabilityPass: false,
        notice: null,
      };

    case "circular":
      assignCircularPositions(graph, options.visibleNodeIds);
      runReadabilityPass(graph);
      return {
        status: "applied",
        preset: "circular",
        ranReadabilityPass: true,
        notice: null,
      };

    case "hierarchical": {
      const projection = buildVisibleDirectedProjection(
        graph,
        options.visibleNodeIds,
        options.visibleEdgeIds,
      );
      const verdict = evaluateHierarchicalEligibility(projection, options.visibleNodeIds);
      if (verdict.status === "rejected") {
        return {
          status: "rejected",
          preset: "hierarchical",
          fallbackPreset: options.activePreset,
          reason: verdict.reason,
          ranReadabilityPass: false,
          notice: {
            level: "info",
            preset: "hierarchical",
            message: hierarchicalRejectionMessage(verdict.reason),
          },
        };
      }

      assignHierarchicalPositions(graph, verdict.generations);
      runReadabilityPass(graph);
      return {
        status: "applied",
        preset: "hierarchical",
        ranReadabilityPass: true,
        notice: null,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Hierarchical helpers
// ---------------------------------------------------------------------------

/**
 * Build a plain DirectedGraph projection of the visible subset. The DAG
 * helpers from graphology-dag refuse to operate on multigraphs, so the
 * projection collapses parallel edges between the same source/target pair
 * into a single directed edge and drops self-loops.
 */
function buildVisibleDirectedProjection(
  graph: MultiDirectedGraph,
  visibleNodeIds: ReadonlySet<string>,
  visibleEdgeIds: ReadonlySet<string>,
): DirectedGraph {
  const projection = new DirectedGraph();
  for (const id of visibleNodeIds) {
    if (graph.hasNode(id)) projection.addNode(id);
  }
  for (const edgeId of visibleEdgeIds) {
    if (!graph.hasEdge(edgeId)) continue;
    const source = graph.source(edgeId);
    const target = graph.target(edgeId);
    if (source === target) continue;
    if (!projection.hasNode(source) || !projection.hasNode(target)) continue;
    if (projection.hasEdge(source, target)) continue;
    projection.addDirectedEdge(source, target);
  }
  return projection;
}

type HierarchicalVerdict =
  | {
      status: "ready";
      generations: readonly HierarchicalGeneration[];
    }
  | {
      status: "rejected";
      reason: "no-directed-edges" | "cyclic" | "single-generation" | "overfull-generation";
    };

/**
 * Decide whether the visible projection can support a useful hierarchical
 * arrangement. The checks match the contract in `contracts/ui-contracts.md`.
 */
function evaluateHierarchicalEligibility(
  projection: DirectedGraph,
  visibleNodeIds: ReadonlySet<string>,
): HierarchicalVerdict {
  if (projection.size === 0) {
    return { status: "rejected", reason: "no-directed-edges" };
  }

  let cyclic: boolean;
  try {
    cyclic = hasCycle(projection);
  } catch {
    // Defensive: treat any cycle-detection failure as cyclic.
    return { status: "rejected", reason: "cyclic" };
  }
  if (cyclic) {
    return { status: "rejected", reason: "cyclic" };
  }

  const generations = topologicalGenerations(projection);
  if (generations.length < 2) {
    return { status: "rejected", reason: "single-generation" };
  }

  const totalVisible = visibleNodeIds.size;
  for (const layer of generations) {
    if (layer.length / totalVisible > HIERARCHICAL_OVERFULL_RATIO) {
      return { status: "rejected", reason: "overfull-generation" };
    }
  }

  return {
    status: "ready",
    generations: generations.map((nodeIds, layerIndex) => ({
      layerIndex,
      nodeIds,
    })),
  };
}

/**
 * Assign layered coordinates: each generation is a horizontal row, evenly
 * spaced around the origin. Sibling spacing scales with the widest layer
 * so dense layers remain readable.
 */
function assignHierarchicalPositions(
  graph: MultiDirectedGraph,
  generations: readonly HierarchicalGeneration[],
): void {
  const maxLayerSize = generations.reduce((acc, g) => Math.max(acc, g.nodeIds.length), 0);
  const colSpacing = Math.max(HIERARCHICAL_COLUMN_SPACING, Math.sqrt(maxLayerSize) * 40);
  const layerCount = generations.length;

  generations.forEach((layer, layerIdx) => {
    const layerY = (layerIdx - (layerCount - 1) / 2) * HIERARCHICAL_LAYER_SPACING;
    const startX = -((layer.nodeIds.length - 1) * colSpacing) / 2;
    layer.nodeIds.forEach((nodeId, colIdx) => {
      if (!graph.hasNode(nodeId)) return;
      graph.setNodeAttribute(nodeId, "x", startX + colIdx * colSpacing);
      graph.setNodeAttribute(nodeId, "y", layerY);
    });
  });
}

/** Human-readable explanation for the non-blocking fallback notice. */
function hierarchicalRejectionMessage(
  reason: "no-directed-edges" | "cyclic" | "single-generation" | "overfull-generation",
): string {
  switch (reason) {
    case "no-directed-edges":
      return "Hierarchical layout needs at least one directed edge in the visible graph.";
    case "cyclic":
      return "Hierarchical layout needs a graph without cycles in its visible projection.";
    case "single-generation":
      return "Hierarchical layout needs the graph to span more than one topological generation.";
    case "overfull-generation":
      return "Hierarchical layout was skipped because one layer would hold most of the visible graph.";
  }
}
