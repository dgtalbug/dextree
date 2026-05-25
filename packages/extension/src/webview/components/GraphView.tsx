import type { GraphEdge, GraphNode } from "@dextree/core";
import type { LensId } from "@dextree/core/lenses";
import { MultiDirectedGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { edgePathFromNodePath } from "graphology-shortest-path";
import { bidirectional } from "graphology-shortest-path/unweighted";
import { bfsFromNode } from "graphology-traversal";
import { motion } from "framer-motion";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sigma from "sigma";

import { computeHoverNeighborhood, type HoverNeighborhood } from "./graphHover.js";
import { GraphToolbar } from "./GraphToolbar.js";
import { InspectorPanel } from "./InspectorPanel.js";
import { LENS_REGISTRY, LensesPanel } from "./LensesPanel.js";
import lensesPanelStyles from "./LensesPanel.module.css";
import { TraceBanner } from "./TraceBanner.js";
import { TraceInspector } from "./TraceInspector.js";
import { dimColor } from "./lensColor.js";
import { CANONICAL_NODE_FILTER_LIST, type NodeFilterEntry } from "./NodeFilterPanel.js";
import {
  TRACE_STATE_IDLE,
  type FallbackNode,
  type FallbackGraph,
  type GraphEdgeAttributes,
  type GraphNodeAttributes,
  type GraphViewProps,
  type OverlaySegment,
  type SearchResultItem,
  type SelectionTraversal,
  type SigmaNodeDisplayData,
  type ThemeColors,
  type TracePhase,
  type TraceState,
  type TracePath,
} from "./graphViewTypes.js";

// Keep faded nodes/edges very dim so only the hovered/selected cluster is prominent
const FADE_ALPHA = 0.06;
const SINGLE_CLICK_DELAY_MS = 180;
const CAMERA_CENTER_DURATION_MS = 380;
const FLOW_MAX_DEPTH = 4;

type SigmaWithExtras = Sigma & {
  getNodeDisplayData?: (node: string) => SigmaNodeDisplayData | undefined;
  // NOTE: graphToViewport is NOT re-declared here — Sigma already exposes
  // graphToViewport(coords: {x,y}) on its prototype; do not shadow it.
  getCamera?: () => {
    animate?: (
      state: { x: number; y: number; ratio: number },
      options?: { duration?: number },
    ) => void;
    getState?: () => { x: number; y: number; ratio: number };
  };
};

function useReducedMotionPreference(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function canUseWebGL(): boolean {
  const canvas = document.createElement("canvas");

  try {
    return (
      canvas.getContext("webgl2") !== null ||
      canvas.getContext("webgl") !== null ||
      canvas.getContext("experimental-webgl") !== null
    );
  } catch {
    return false;
  }
}

function readThemeColors(): ThemeColors {
  const styles = getComputedStyle(document.body);
  const foreground = styles.getPropertyValue("--vscode-foreground").trim();
  const classColor =
    styles.getPropertyValue("--vscode-symbolIcon-classForeground").trim() || foreground;
  const interfaceColor =
    styles.getPropertyValue("--vscode-symbolIcon-interfaceForeground").trim() || classColor;

  return {
    backgroundColor: styles.getPropertyValue("--vscode-editor-background").trim() || "transparent",
    labelColor: foreground,
    disabledColor:
      styles.getPropertyValue("--vscode-disabledForeground").trim() ||
      styles.getPropertyValue("--vscode-descriptionForeground").trim() ||
      foreground,
    fileNodeColor:
      styles.getPropertyValue("--vscode-symbolIcon-fileForeground").trim() || foreground,
    symbolKindColors: {
      default: classColor,
      function:
        styles.getPropertyValue("--vscode-symbolIcon-functionForeground").trim() || foreground,
      class: classColor,
      interface: interfaceColor,
      enum: styles.getPropertyValue("--vscode-symbolIcon-enumForeground").trim() || classColor,
      variable:
        styles.getPropertyValue("--vscode-symbolIcon-variableForeground").trim() || foreground,
      type: interfaceColor || classColor,
      method:
        styles.getPropertyValue("--vscode-symbolIcon-methodForeground").trim() ||
        styles.getPropertyValue("--vscode-symbolIcon-functionForeground").trim() ||
        foreground,
    },
    definesEdgeColor: styles.getPropertyValue("--vscode-charts-blue").trim() || foreground,
    importsEdgeColor: styles.getPropertyValue("--vscode-charts-green").trim() || foreground,
    callsEdgeColor: styles.getPropertyValue("--vscode-charts-orange").trim() || foreground,
    inheritsEdgeColor: styles.getPropertyValue("--vscode-charts-purple").trim() || foreground,
    instantiatesEdgeColor: styles.getPropertyValue("--vscode-charts-red").trim() || foreground,
    // Slice 023 — trace path edge color. Reuses the chart yellow if defined;
    // falls back to a static yellow that survives all known VS Code themes.
    tracePathEdgeColor: styles.getPropertyValue("--vscode-charts-yellow").trim() || "#dcdcaa",
  };
}

function toFadedColor(color: unknown, fallbackColor: string): string {
  const nextColor = typeof color === "string" && color.length > 0 ? color : fallbackColor;
  const rgbaMatch = nextColor.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
  if (rgbaMatch !== null) {
    return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${FADE_ALPHA})`;
  }

  const hexMatch = nextColor.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch !== null) {
    const hex = hexMatch[1] as string;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${FADE_ALPHA})`;
  }

  return fallbackColor;
}

function edgeColor(kind: GraphEdge["kind"], colors: ThemeColors): string {
  switch (kind) {
    case "DEFINES":
      return colors.definesEdgeColor;
    case "IMPORTS":
      return colors.importsEdgeColor;
    case "CALLS":
      return colors.callsEdgeColor;
    case "INHERITS":
      return colors.inheritsEdgeColor;
    case "INSTANTIATES":
      return colors.instantiatesEdgeColor;
    default:
      return colors.definesEdgeColor;
  }
}

function edgeSize(kind: GraphEdge["kind"]): number {
  switch (kind) {
    case "DEFINES":
      return 2.2; // file→symbol: solid bold
    case "CALLS":
      return 1.8;
    case "INHERITS":
      return 2.0; // class hierarchy: prominent
    case "INSTANTIATES":
      return 1.6;
    case "IMPORTS":
    default:
      return 1.4; // file→file: visible arc connecting file nodes
  }
}

function symbolColor(node: GraphNode, colors: ThemeColors): string {
  if (node.type === "file") {
    return colors.fileNodeColor;
  }

  if (node.symbolKind === "type") {
    return colors.symbolKindColors.type || colors.symbolKindColors.class;
  }

  if (node.symbolKind !== undefined) {
    return colors.symbolKindColors[node.symbolKind] || colors.symbolKindColors.default;
  }

  return colors.symbolKindColors.default;
}

function buildInitialPositions(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const fileNodes = nodes.filter((n) => n.type === "file");
  const symbolNodes = nodes.filter((n) => n.type !== "file");

  // Files evenly spaced around a large outer ring so FA2 starts with them spread apart.
  const FILE_RADIUS = 1.8;
  const filePosByPath = new Map<string, { x: number; y: number }>();
  for (const [fi, file] of fileNodes.entries()) {
    const angle = (fi / Math.max(fileNodes.length, 1)) * Math.PI * 2;
    const pos = { x: Math.cos(angle) * FILE_RADIUS, y: Math.sin(angle) * FILE_RADIUS };
    positions.set(file.id, pos);
    filePosByPath.set(file.filePath, pos);
  }

  // Group symbols by their source file so we can fan them around the file's seed position.
  const symsByFile = new Map<string, GraphNode[]>();
  for (const sym of symbolNodes) {
    const arr = symsByFile.get(sym.filePath);
    if (arr === undefined) {
      symsByFile.set(sym.filePath, [sym]);
    } else {
      arr.push(sym);
    }
  }

  // Symbols radiate outward from their parent file in a tight arc.  FA2 then pulls the
  // whole cluster together, keeping related symbols visually near their file node.
  const SYM_RING = 0.55;
  const symIndexInFile = new Map<string, number>();
  let orphanIndex = 0;
  for (const sym of symbolNodes) {
    const filePos = filePosByPath.get(sym.filePath);
    const bucket = symsByFile.get(sym.filePath)!;
    const si = symIndexInFile.get(sym.filePath) ?? 0;
    symIndexInFile.set(sym.filePath, si + 1);

    if (filePos !== undefined) {
      const angle = (si / Math.max(bucket.length, 1)) * Math.PI * 2;
      positions.set(sym.id, {
        x: filePos.x + Math.cos(angle) * SYM_RING,
        y: filePos.y + Math.sin(angle) * SYM_RING,
      });
    } else {
      // Orphaned symbol (no matching file node) — place in inner ring.
      const angle = (orphanIndex / Math.max(symbolNodes.length, 1)) * Math.PI * 2;
      positions.set(sym.id, { x: Math.cos(angle) * 0.8, y: Math.sin(angle) * 0.8 });
      orphanIndex++;
    }
  }

  return positions;
}

const FILE_SIZE_RANGE = { min: 14, max: 28, base: 16 } as const;
const SYMBOL_SIZE_RANGE = { min: 5, max: 15, base: 7 } as const;
const METHOD_SIZE_RANGE = { min: 3, max: 9, base: 4 } as const;

/**
 * Mix an edge color at `ratio` opacity against a background color to produce
 * a faint-but-solid hex color that looks "dotted/ghost" without relying on
 * WebGL per-pixel alpha blending (which Sigma 3 uses premultiplied mode for,
 * making naive rgba() colors appear brighter rather than transparent).
 */
function mixWithBackground(color: string, bgColor: string, ratio: number): string {
  const parseHexColor = (c: string): [number, number, number] | null => {
    const m = c.match(/^#([0-9a-f]{6})$/i);
    if (m === null) return null;
    const h = m[1] as string;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const src = parseHexColor(color);
  const bg = parseHexColor(bgColor);
  if (src === null || bg === null) return color;
  const r = Math.round(src[0] * ratio + bg[0] * (1 - ratio));
  const g = Math.round(src[1] * ratio + bg[1] * (1 - ratio));
  const b = Math.round(src[2] * ratio + bg[2] * (1 - ratio));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function computeSizeBounds(nodes: GraphNode[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    if (typeof node.importance !== "number" || !Number.isFinite(node.importance)) {
      continue;
    }

    if (node.importance < min) {
      min = node.importance;
    }

    if (node.importance > max) {
      max = node.importance;
    }
  }

  return { min, max };
}

function sizeForNode(node: GraphNode, bounds: { min: number; max: number }): number {
  const range =
    node.type === "file"
      ? FILE_SIZE_RANGE
      : node.symbolKind === "method"
        ? METHOD_SIZE_RANGE
        : SYMBOL_SIZE_RANGE;

  if (
    typeof node.importance !== "number" ||
    !Number.isFinite(node.importance) ||
    bounds.max <= bounds.min
  ) {
    return range.base;
  }

  const t = (node.importance - bounds.min) / (bounds.max - bounds.min);
  return range.min + t * (range.max - range.min);
}

function buildGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  colors: ThemeColors,
): MultiDirectedGraph {
  const graph = new MultiDirectedGraph();
  const seenNodeIds = new Set<string>();
  const seenEdgeIds = new Set<string>();
  const importanceBounds = computeSizeBounds(nodes);
  let generatedEdgeIndex = 0;

  // Pre-compute clustered initial positions (symbols near their parent file).
  const initialPositions = buildInitialPositions(nodes);

  for (const node of nodes) {
    if (node.id.trim() === "" || seenNodeIds.has(node.id)) {
      continue;
    }

    const position = initialPositions.get(node.id) ?? { x: 0, y: 0 };
    const color = symbolColor(node, colors);
    const size = sizeForNode(node, importanceBounds);
    seenNodeIds.add(node.id);

    graph.addNode(node.id, {
      label: node.label.trim() || node.filePath.split("/").pop() || node.id,
      filePath: node.filePath,
      startLine: Number.isFinite(node.startLine) ? node.startLine : 1,
      nodeKind: node.type,
      symbolKind: node.symbolKind,
      x: position.x,
      y: position.y,
      size,
      baseSize: size,
      color,
      baseColor: color,
    } satisfies GraphNodeAttributes);
  }

  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
      continue;
    }

    const edgeId =
      edge.id.trim() !== "" && !seenEdgeIds.has(edge.id)
        ? edge.id
        : `${edge.kind}:${edge.source}:${edge.target}:${generatedEdgeIndex++}`;

    seenEdgeIds.add(edgeId);

    try {
      const rawColor = edgeColor(edge.kind, colors);
      // IMPORTS (file→file): mix at 72% against background — visible file-to-file arcs
      // without competing with DEFINES/CALLS edges in the foreground.
      const color =
        edge.kind === "IMPORTS"
          ? mixWithBackground(rawColor, colors.backgroundColor, 0.72)
          : rawColor;
      const size = edgeSize(edge.kind);
      graph.addEdgeWithKey(edgeId, edge.source, edge.target, {
        edgeKind: edge.kind,
        color,
        baseColor: rawColor,
        size,
        baseSize: size,
      } satisfies GraphEdgeAttributes);
    } catch {
      continue;
    }
  }

  return graph;
}

function stabilizeFileAnchors(graph: MultiDirectedGraph): void {
  const fileNodes: string[] = [];
  let centroidX = 0;
  let centroidY = 0;
  let count = 0;

  graph.forEachNode((node, attributes) => {
    centroidX += Number(attributes.x);
    centroidY += Number(attributes.y);
    count += 1;

    if ((attributes as GraphNodeAttributes).nodeKind === "file") {
      fileNodes.push(node);
    }
  });

  if (count === 0 || fileNodes.length === 0) {
    return;
  }

  centroidX /= count;
  centroidY /= count;

  for (const nodeId of fileNodes) {
    const attributes = graph.getNodeAttributes(nodeId) as GraphNodeAttributes;
    const dx = Number(attributes.x) - centroidX;
    const dy = Number(attributes.y) - centroidY;
    const magnitude = Math.max(Math.hypot(dx, dy), 0.01);
    const radius = magnitude * 1.14 + 0.2;

    graph.mergeNodeAttributes(nodeId, {
      x: centroidX + (dx / magnitude) * radius,
      y: centroidY + (dy / magnitude) * radius,
    });
  }
}

function snapshotGraph(graph: MultiDirectedGraph): FallbackGraph {
  const nodes = graph.nodes().map((nodeId) => {
    const attributes = graph.getNodeAttributes(nodeId) as GraphNodeAttributes;

    return {
      id: nodeId,
      label: attributes.label,
      filePath: attributes.filePath,
      startLine: attributes.startLine,
      x: Number.isFinite(attributes.x) ? attributes.x : 0,
      y: Number.isFinite(attributes.y) ? attributes.y : 0,
      color: attributes.baseColor,
      type: attributes.nodeKind,
    };
  });

  const minX = Math.min(...nodes.map((node) => node.x), 0);
  const maxX = Math.max(...nodes.map((node) => node.x), 1);
  const minY = Math.min(...nodes.map((node) => node.y), 0);
  const maxY = Math.max(...nodes.map((node) => node.y), 1);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);

  const positionedNodes = nodes.map((node) => ({
    ...node,
    x: 12 + ((node.x - minX) / spanX) * 76,
    y: 16 + ((node.y - minY) / spanY) * 68,
  }));

  const edges = graph.edges().map((edgeId) => ({
    id: edgeId,
    source: graph.source(edgeId),
    target: graph.target(edgeId),
    color: String(graph.getEdgeAttribute(edgeId, "baseColor")),
    kind: graph.getEdgeAttribute(edgeId, "edgeKind") as GraphEdge["kind"],
  }));

  return {
    nodes: positionedNodes,
    edges,
  };
}

function fallbackNodeLabel(node: FallbackNode): string {
  if (node.type === "file") {
    return node.filePath.split("/").pop() || node.label;
  }

  return node.label;
}

function fallbackNodeTitle(node: FallbackNode): string {
  if (node.type === "file") {
    return node.filePath;
  }

  return `${node.label} · ${node.filePath}:${node.startLine}`;
}

function edgeEndpointLabel(nodeId: string, nodesById: Map<string, FallbackNode>): string {
  const node = nodesById.get(nodeId);

  if (node === undefined) {
    return nodeId;
  }

  return fallbackNodeLabel(node);
}

function handleFallbackKeyDown(
  event: KeyboardEvent<SVGGElement>,
  node: FallbackNode,
  onNavigate: (filePath: string, line: number) => void,
): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  onNavigate(node.filePath, node.startLine);
}

function StaticGraphFallback({
  fallbackGraph,
  onNavigate,
}: {
  fallbackGraph: FallbackGraph;
  onNavigate: (filePath: string, line: number) => void;
}) {
  const nodesById = new Map(fallbackGraph.nodes.map((node) => [node.id, node]));

  return (
    <div className="dxt-fallback-graph dxt-graph-stage" data-testid="graph-view-fallback">
      <div className="dxt-fallback-layout">
        <div className="dxt-fallback-surface">
          <svg
            className="dxt-fallback-canvas"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label="Symbol graph"
          >
            {fallbackGraph.edges.map((edge) => {
              const source = nodesById.get(edge.source);
              const target = nodesById.get(edge.target);

              if (source === undefined || target === undefined) {
                return null;
              }

              return (
                <line
                  key={edge.id}
                  className="dxt-fallback-edge"
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={edge.color}
                />
              );
            })}

            {fallbackGraph.nodes.map((node) => (
              <g
                key={node.id}
                className={`dxt-fallback-node dxt-fallback-node-${node.type}`}
                transform={`translate(${node.x} ${node.y})`}
                color={node.color}
                role="button"
                tabIndex={0}
                aria-label={node.label}
                onClick={() => onNavigate(node.filePath, node.startLine)}
                onKeyDown={(event) => handleFallbackKeyDown(event, node, onNavigate)}
              >
                <title>{fallbackNodeTitle(node)}</title>
                {node.type === "file" ? (
                  <rect
                    className="dxt-fallback-node-shape"
                    x="-4.25"
                    y="-2.6"
                    width="8.5"
                    height="5.2"
                    rx="2.6"
                    ry="2.6"
                  />
                ) : (
                  <circle className="dxt-fallback-node-shape" r="2.35" />
                )}
                <text className="dxt-fallback-node-label" x="4.8" y="0.9">
                  {fallbackNodeLabel(node)}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div className="dxt-fallback-relations" aria-label="Graph relations">
          <div className="dxt-fallback-relations-title">Relations</div>
          <ul className="dxt-fallback-relation-list">
            {fallbackGraph.edges.map((edge) => (
              <li key={edge.id} className="dxt-fallback-relation-item">
                <button
                  type="button"
                  className="dxt-fallback-relation-node"
                  aria-label={`Open source ${edgeEndpointLabel(edge.source, nodesById)}`}
                  onClick={() => {
                    const source = nodesById.get(edge.source);
                    if (source !== undefined) {
                      onNavigate(source.filePath, source.startLine);
                    }
                  }}
                >
                  {edgeEndpointLabel(edge.source, nodesById)}
                </button>
                <span
                  className={`dxt-fallback-edge-pill dxt-fallback-edge-pill-${edge.kind.toLowerCase()}`}
                >
                  {edge.kind}
                </span>
                <button
                  type="button"
                  className="dxt-fallback-relation-node"
                  aria-label={`Open target ${edgeEndpointLabel(edge.target, nodesById)}`}
                  onClick={() => {
                    const target = nodesById.get(edge.target);
                    if (target !== undefined) {
                      onNavigate(target.filePath, target.startLine);
                    }
                  }}
                >
                  {edgeEndpointLabel(edge.target, nodesById)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const ALL_EDGE_KINDS: GraphEdge["kind"][] = [
  "DEFINES",
  "IMPORTS",
  "CALLS",
  "INHERITS",
  "INSTANTIATES",
];

function computeSelection(
  graph: MultiDirectedGraph,
  selectedNodeId: string | null,
  maxDepth: number,
): SelectionTraversal | null {
  if (selectedNodeId === null || !graph.hasNode(selectedNodeId)) {
    return null;
  }

  const nodeIds = new Set<string>([selectedNodeId]);
  // Group visited nodes by depth so we can walk outbound edges layer-by-layer below.
  const nodesByDepth = new Map<number, string[]>([[0, [selectedNodeId]]]);

  bfsFromNode(
    graph,
    selectedNodeId,
    (node, _attrs, depth) => {
      // bfsFromNode invokes the callback for the start node at depth 0 too.
      if (node !== selectedNodeId) {
        nodeIds.add(node);
        const layer = nodesByDepth.get(depth);
        if (layer === undefined) {
          nodesByDepth.set(depth, [node]);
        } else {
          layer.push(node);
        }
      }
      // Returning true prunes further traversal beyond this node. We prune when
      // we've reached maxDepth so the next layer is never expanded.
      return depth >= maxDepth;
    },
    { mode: "outbound" },
  );

  // Walk outbound edges per BFS layer to reproduce hopLayers / orderedEdgeIds
  // exactly as the legacy implementation produced them. The DEFINES quirk
  // (re-adding the source node when the edge is DEFINES) is preserved.
  const edgeIds = new Set<string>();
  const orderedEdgeIds: string[] = [];
  const hopLayers: string[][] = [];

  for (let depth = 0; depth < maxDepth; depth++) {
    const frontier = nodesByDepth.get(depth);
    if (frontier === undefined) {
      break;
    }
    const layerEdges: string[] = [];
    for (const currentNodeId of frontier) {
      graph.forEachOutboundEdge(currentNodeId, (edge, attributes, _source, target) => {
        edgeIds.add(edge);
        orderedEdgeIds.push(edge);
        layerEdges.push(edge);

        // Ensure all reachable targets at depth+1 are in nodeIds even if BFS
        // pruned them (e.g. when an edge crosses to a node already visited at
        // the same or lower depth).
        nodeIds.add(target);

        if ((attributes as GraphEdgeAttributes).edgeKind === "DEFINES") {
          nodeIds.add(currentNodeId);
        }
      });
    }
    if (layerEdges.length > 0) {
      hopLayers.push(layerEdges);
    }
  }

  return {
    selectedNodeId,
    nodeIds,
    edgeIds,
    orderedEdgeIds,
    hopLayers,
    maxDepth,
  };
}

/**
 * Derive a TracePath summary from the trace state for the right-rail
 * TraceInspector (slice 023). Returns null when the path is empty.
 * `layersCrossed` is currently always empty because `arch_layer` is a
 * slice 026 column; we render gracefully when absent per spec CC-003.
 */
function computeTracePath(graph: MultiDirectedGraph, state: TraceState): TracePath | null {
  if (state.pathNodeIds.length === 0 || state.startNodeId === null || state.endNodeId === null) {
    return null;
  }

  const filePaths = new Set<string>();
  const frameworks = new Set<string>();
  for (const nodeId of state.pathNodeIds) {
    if (!graph.hasNode(nodeId)) {
      continue;
    }
    const filePath = graph.getNodeAttribute(nodeId, "filePath") as string | undefined;
    if (typeof filePath === "string" && filePath.length > 0) {
      filePaths.add(filePath);
    }
    const framework = graph.getNodeAttribute(nodeId, "framework") as string | undefined;
    if (typeof framework === "string" && framework.length > 0) {
      frameworks.add(framework);
    }
  }

  return {
    startNodeId: state.startNodeId,
    endNodeId: state.endNodeId,
    hopCount: state.pathEdgeIds.length,
    fileCount: filePaths.size,
    layersCrossed: [],
    crossesFrameworkBoundary: frameworks.size > 1,
    nodeIds: state.pathNodeIds,
    edgeIds: state.pathEdgeIds,
  };
}

function createOverlaySegments(
  graph: MultiDirectedGraph,
  sigma: Sigma,
  selection: SelectionTraversal | null,
): OverlaySegment[] {
  if (selection === null) {
    return [];
  }

  const sigmaWithExtras = sigma as SigmaWithExtras;
  const getNodeDisplayData = sigmaWithExtras.getNodeDisplayData;

  if (typeof getNodeDisplayData !== "function") {
    return [];
  }

  // Build edgeId → hopIndex map from depth-bucketed BFS layers
  const edgeHopIndex = new Map<string, number>();
  for (const [idx, layer] of selection.hopLayers.entries()) {
    for (const edgeId of layer) {
      edgeHopIndex.set(edgeId, idx);
    }
  }

  const segments: OverlaySegment[] = [];

  for (const edgeId of selection.orderedEdgeIds.slice(0, 24)) {
    const sourceId = graph.source(edgeId);
    const targetId = graph.target(edgeId);
    const source = getNodeDisplayData.call(sigmaWithExtras, sourceId);
    const target = getNodeDisplayData.call(sigmaWithExtras, targetId);

    if (
      source === undefined ||
      target === undefined ||
      source.hidden ||
      target.hidden ||
      !Number.isFinite(source.x) ||
      !Number.isFinite(source.y) ||
      !Number.isFinite(target.x) ||
      !Number.isFinite(target.y)
    ) {
      continue;
    }

    segments.push({
      id: edgeId,
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      color: String(graph.getEdgeAttribute(edgeId, "baseColor")),
      kind: graph.getEdgeAttribute(edgeId, "edgeKind") as GraphEdge["kind"],
      hopIndex: edgeHopIndex.get(edgeId) ?? 0,
    });
  }

  return segments;
}

function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.x < points[start]!.x) start = i;
  }
  const hull: { x: number; y: number }[] = [];
  let current = start;
  do {
    hull.push(points[current]!);
    let next = (current + 1) % points.length;
    for (let i = 0; i < points.length; i++) {
      const cross =
        (points[next]!.x - points[current]!.x) * (points[i]!.y - points[current]!.y) -
        (points[next]!.y - points[current]!.y) * (points[i]!.x - points[current]!.x);
      if (cross < 0) next = i;
    }
    current = next;
  } while (current !== start && hull.length <= points.length);
  return hull;
}

function colorWithAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (m === null) return `rgba(128,128,128,${alpha})`;
  const h = m[1] as string;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawClusterHulls(
  graph: MultiDirectedGraph,
  sigma: Sigma,
  canvas: HTMLCanvasElement,
  hoveredFilePath: string | null,
  selectedFilePath: string | null,
): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Group symbol nodes by filePath, collect viewport coordinates.
  // sigma.graphToViewport takes graph-space {x,y} coords — NOT a node ID.
  const fileGroups = new Map<string, Array<{ x: number; y: number }>>();
  const fileColors = new Map<string, string>();

  graph.forEachNode((_nodeId, attrs) => {
    const a = attrs as GraphNodeAttributes;
    if (a.nodeKind === "file") {
      fileColors.set(String(a.filePath), String(a.baseColor ?? a.color));
      return;
    }
    const gx = Number(a.x);
    const gy = Number(a.y);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;
    const vp = sigma.graphToViewport({ x: gx, y: gy });
    const fp = String(a.filePath);
    let group = fileGroups.get(fp);
    if (group === undefined) {
      group = [];
      fileGroups.set(fp, group);
    }
    group.push({ x: vp.x, y: vp.y });
  });

  for (const [fp, points] of fileGroups.entries()) {
    if (points.length < 3) continue;
    const hull = convexHull(points);
    if (hull.length < 3) continue;

    // Compute centroid
    let cx = 0;
    let cy = 0;
    for (const p of hull) {
      cx += p.x;
      cy += p.y;
    }
    cx /= hull.length;
    cy /= hull.length;

    // Expand hull outward by 14px from centroid
    const expanded = hull.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.max(Math.hypot(dx, dy), 0.01);
      return { x: cx + (dx / dist) * (dist + 14), y: cy + (dy / dist) * (dist + 14) };
    });

    const isActive = fp === hoveredFilePath || fp === selectedFilePath;
    const isDimmed = (hoveredFilePath !== null || selectedFilePath !== null) && !isActive;
    const fillAlpha = isActive ? 0.14 : isDimmed ? 0.03 : 0.08;
    const strokeAlpha = isActive ? 0.5 : isDimmed ? 0.1 : 0.28;
    const baseColor = fileColors.get(fp) ?? "#808080";

    ctx.beginPath();
    ctx.moveTo(expanded[0]!.x, expanded[0]!.y);
    for (let i = 1; i < expanded.length; i++) {
      ctx.lineTo(expanded[i]!.x, expanded[i]!.y);
    }
    ctx.closePath();
    ctx.fillStyle = colorWithAlpha(baseColor, fillAlpha);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(expanded[0]!.x, expanded[0]!.y);
    for (let i = 1; i < expanded.length; i++) {
      ctx.lineTo(expanded[i]!.x, expanded[i]!.y);
    }
    ctx.closePath();
    ctx.strokeStyle = colorWithAlpha(baseColor, strokeAlpha);
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawMinimap(
  graph: MultiDirectedGraph,
  sigma: Sigma,
  canvas: HTMLCanvasElement,
  _container: HTMLDivElement,
): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;

  const W = canvas.width;
  const H = canvas.height;

  const nodePoints: Array<{ x: number; y: number; color: string; isFile: boolean }> = [];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  graph.forEachNode((_nodeId, attrs) => {
    const a = attrs as GraphNodeAttributes;
    const x = Number(a.x);
    const y = Number(a.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    nodePoints.push({
      x,
      y,
      color: String(a.baseColor ?? a.color),
      isFile: a.nodeKind === "file",
    });
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

  if (nodePoints.length <= 1 || minX >= maxX || minY >= maxY) return;

  const pad = 6;
  const scaleX = (W - 2 * pad) / (maxX - minX);
  const scaleY = (H - 2 * pad) / (maxY - minY);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.fill();

  for (const pt of nodePoints) {
    const pcx = pad + (pt.x - minX) * scaleX;
    const pcy = pad + (pt.y - minY) * scaleY;
    ctx.beginPath();
    ctx.arc(pcx, pcy, pt.isFile ? 2 : 1, 0, Math.PI * 2);
    ctx.fillStyle = pt.color;
    ctx.fill();
  }

  // Draw camera crosshair
  const sigmaPlus = sigma as SigmaWithExtras;
  const cameraState = sigmaPlus.getCamera?.()?.getState?.();
  if (cameraState !== undefined) {
    const camX = Number(cameraState.x);
    const camY = Number(cameraState.y);
    if (Number.isFinite(camX) && Number.isFinite(camY)) {
      const ccx = pad + (camX - minX) * scaleX;
      const ccy = pad + (camY - minY) * scaleY;
      ctx.beginPath();
      ctx.arc(ccx, ccy, 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function applySigmaSetting(sigma: Sigma, key: string, value: unknown): void {
  (sigma as unknown as { setSetting: (setting: string, nextValue: unknown) => void }).setSetting(
    key,
    value,
  );
}

function refreshSigma(sigma: Sigma): void {
  const maybeRefresh = sigma as unknown as { refresh?: () => void };
  maybeRefresh.refresh?.();
}

function applyTheme(graph: MultiDirectedGraph, sigma: Sigma, container: HTMLDivElement): void {
  const colors = readThemeColors();

  container.style.backgroundColor = colors.backgroundColor;

  graph.forEachNode((node, attributes) => {
    const nextColor =
      attributes.nodeKind === "file"
        ? colors.fileNodeColor
        : symbolColor(
            {
              id: node,
              type: attributes.nodeKind,
              label: attributes.label,
              filePath: attributes.filePath,
              startLine: attributes.startLine,
              symbolKind: attributes.symbolKind,
            },
            colors,
          );

    graph.mergeNodeAttributes(node, {
      color: nextColor,
      baseColor: nextColor,
    });
  });

  graph.forEachEdge((edge, attributes) => {
    const kind = attributes.edgeKind as GraphEdge["kind"];
    const rawColor = edgeColor(kind, colors);
    const color =
      kind === "IMPORTS" ? mixWithBackground(rawColor, colors.backgroundColor, 0.72) : rawColor;
    graph.mergeEdgeAttributes(edge, {
      color,
      baseColor: rawColor,
    });
  });

  applySigmaSetting(sigma, "labelColor", { color: colors.labelColor });
  applySigmaSetting(sigma, "defaultNodeColor", colors.symbolKindColors.default);
  applySigmaSetting(sigma, "defaultEdgeColor", colors.definesEdgeColor);
  refreshSigma(sigma);
}

function centerCameraOnNode(graph: MultiDirectedGraph, sigma: Sigma, nodeId: string): void {
  const sigmaWithExtras = sigma as SigmaWithExtras;
  const camera = sigmaWithExtras.getCamera?.();
  const state = camera?.getState?.();

  if (camera?.animate === undefined || state === undefined || !graph.hasNode(nodeId)) {
    return;
  }

  const attributes = graph.getNodeAttributes(nodeId) as GraphNodeAttributes;
  camera.animate(
    {
      x: attributes.x,
      y: attributes.y,
      ratio: state.ratio,
    },
    { duration: CAMERA_CENTER_DURATION_MS },
  );
}

export function GraphView({ nodes, edges, onNavigate, onExportMermaid }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<MultiDirectedGraph | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const hoverRef = useRef<HoverNeighborhood | null>(null);
  const hoverSelectionRef = useRef<SelectionTraversal | null>(null);
  const selectionRef = useRef<SelectionTraversal | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  // Tracks last single-click for manual double-click detection on nodes.
  // Sigma 3's "doubleClickNode" can miss if WebGL picking fails on rapid 2nd click.
  const lastClickRef = useRef<{ node: string; time: number } | null>(null);
  const clusterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useReducedMotionPreference();

  const [error, setError] = useState<string | null>(null);
  const [fallbackGraph, setFallbackGraph] = useState<FallbackGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [overlaySegments, setOverlaySegments] = useState<OverlaySegment[]>([]);
  const [showMinimap, setShowMinimap] = useState(false);
  const [hiddenEdgeKinds, setHiddenEdgeKinds] = useState<Set<GraphEdge["kind"]>>(new Set());
  const hiddenEdgeKindsRef = useRef<Set<GraphEdge["kind"]>>(new Set());
  const [hiddenNodeKinds, setHiddenNodeKinds] = useState<Set<string>>(new Set());
  const hiddenNodeKindsRef = useRef<Set<string>>(new Set());
  const [activeLensId, setActiveLensId] = useState<LensId | null>(null);
  const lensMatchSetRef = useRef<ReadonlySet<string> | null>(null);
  // Search state (slice 022). `searchQuery` is the committed (post-debounce)
  // value; the SearchBar manages its own pending input internally.
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchFocusedIndex, setSearchFocusedIndex] = useState<number>(0);
  const matchedNodeIdsRef = useRef<Set<string>>(new Set());
  // Depth slider state (slice 022). Default 3 per spec FR-005.
  const [depth, setDepth] = useState<number>(3);
  // Trace state (slice 023). Tracks the trace state machine and the
  // resolved path. `tracePhaseRef` mirrors `traceState.phase` so the
  // Sigma clickNode callback can route clicks without being re-registered.
  const [traceState, setTraceState] = useState<TraceState>(TRACE_STATE_IDLE);
  const tracePhaseRef = useRef<TracePhase>("idle");
  const pathNodeIdsRef = useRef<Set<string>>(new Set());
  const pathEdgeIdsRef = useRef<Set<string>>(new Set());

  const toggleEdgeKind = useCallback((kind: GraphEdge["kind"]) => {
    setHiddenEdgeKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }, []);

  const toggleNodeKind = useCallback((key: string) => {
    setHiddenNodeKinds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const onToggleMinimap = useCallback(() => {
    setShowMinimap((visible) => !visible);
  }, []);

  const nodeFilterEntries = useMemo<NodeFilterEntry[]>(() => {
    const counts = new Map<string, number>();
    for (const node of nodes) {
      const key = node.type === "file" ? "file" : (node.symbolKind ?? "function");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return CANONICAL_NODE_FILTER_LIST.map((template) => ({
      ...template,
      count: counts.get(template.key) ?? 0,
    }));
  }, [nodes]);

  // Compute counts for all five lenses against the current subgraph. Stub
  // lenses (selector === null) contribute 0. Runs once per subgraph change.
  const lensCounts = useMemo<Record<LensId, number>>(() => {
    const graph = graphRef.current;
    const empty: Record<LensId, number> = {
      "god-class": 0,
      "most-used": 0,
      "least-used": 0,
      "entry-points": 0,
      architecture: 0,
    };
    if (graph === null) return empty;
    const out = { ...empty };
    for (const id of Object.keys(LENS_REGISTRY) as LensId[]) {
      const selector = LENS_REGISTRY[id].selector;
      if (selector !== null) {
        out[id] = selector(graph, nodes).size;
      }
    }
    return out;
  }, [nodes]);

  // Compute the set of node IDs the active lens matches. Recomputes when the
  // user switches lenses or the subgraph changes. `null` means no lens active.
  const lensMatchSet = useMemo<ReadonlySet<string> | null>(() => {
    if (activeLensId === null) return null;
    const graph = graphRef.current;
    if (graph === null) return null;
    const selector = LENS_REGISTRY[activeLensId].selector;
    if (selector === null) return null;
    return selector(graph, nodes);
  }, [activeLensId, nodes]);

  const onLensToggle = useCallback((id: LensId) => {
    setActiveLensId((current) => (current === id ? null : id));
  }, []);

  // Search results (slice 022). Case-insensitive substring match on label +
  // filePath. `fqn` is referenced in the spec but not yet present on GraphNode;
  // falls back gracefully (always-undefined) per FR-005 / CC-003.
  const searchResults = useMemo<SearchResultItem[]>(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length === 0) {
      return [];
    }
    const needle = trimmed.toLowerCase();
    const out: SearchResultItem[] = [];
    for (const node of nodes) {
      const labelLower = node.label.toLowerCase();
      const filePathLower = node.filePath.toLowerCase();
      const labelHit = labelLower.indexOf(needle);
      const filePathHit = filePathLower.indexOf(needle);
      const matchIndex = labelHit >= 0 ? labelHit : filePathHit;
      if (matchIndex < 0) {
        continue;
      }
      out.push({
        nodeId: node.id,
        label: node.label,
        filePath: node.filePath,
        matchIndex,
      });
    }
    return out;
  }, [nodes, searchQuery]);

  const matchedNodeIds = useMemo<Set<string>>(() => {
    return new Set(searchResults.map((r) => r.nodeId));
  }, [searchResults]);

  // Depth slider is enabled only when there's something to expand from —
  // either an explicit selection or a search match set.
  const depthEnabled = selectedNodeId !== null || matchedNodeIds.size > 0;

  const handleSearchQueryChange = useCallback((next: string): void => {
    setSearchQuery(next);
    setSearchFocusedIndex(0);
  }, []);

  const handleSearchSelectResult = useCallback((nodeId: string, index: number): void => {
    setSearchFocusedIndex(index);
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (sigma === null || graph === null || !graph.hasNode(nodeId)) {
      return;
    }
    const sigmaWithExtras = sigma as SigmaWithExtras;
    const camera = sigmaWithExtras.getCamera?.();
    if (camera?.animate !== undefined) {
      const x = graph.getNodeAttribute(nodeId, "x") as number | undefined;
      const y = graph.getNodeAttribute(nodeId, "y") as number | undefined;
      const currentRatio = camera.getState?.().ratio ?? 1;
      if (typeof x === "number" && typeof y === "number") {
        camera.animate({ x, y, ratio: currentRatio }, { duration: CAMERA_CENTER_DURATION_MS });
      }
    }
  }, []);

  const handleSearchClear = useCallback((): void => {
    setSearchQuery("");
    setSearchFocusedIndex(0);
  }, []);

  const handleDepthChange = useCallback((next: number): void => {
    setDepth(next);
  }, []);

  // Trace mode handlers (slice 023).
  const handleTraceToggle = useCallback((): void => {
    setTraceState((current) => {
      if (current.phase !== "idle") {
        tracePhaseRef.current = "idle";
        return TRACE_STATE_IDLE;
      }
      // Entering trace mode clears search + depth so the full graph is
      // visible for node picking (spec FR-010).
      setSearchQuery("");
      setSearchFocusedIndex(0);
      setDepth(3);
      tracePhaseRef.current = "picking-start";
      return { ...TRACE_STATE_IDLE, phase: "picking-start" };
    });
  }, []);

  const handleTraceExit = useCallback((): void => {
    tracePhaseRef.current = "idle";
    setTraceState(TRACE_STATE_IDLE);
  }, []);

  const handleTracePathCompute = useCallback((startId: string, endId: string): void => {
    const graph = graphRef.current;
    if (graph === null || !graph.hasNode(startId) || !graph.hasNode(endId)) {
      return;
    }
    const nodePath = bidirectional(graph, startId, endId);
    if (nodePath === null) {
      tracePhaseRef.current = "path-active";
      setTraceState({
        phase: "path-active",
        startNodeId: startId,
        endNodeId: endId,
        pathNodeIds: [],
        pathEdgeIds: [],
        noPathFound: true,
        selfTraceError: false,
      });
      return;
    }
    const edgePath = edgePathFromNodePath(graph, nodePath);
    tracePhaseRef.current = "path-active";
    setTraceState({
      phase: "path-active",
      startNodeId: startId,
      endNodeId: endId,
      pathNodeIds: nodePath,
      pathEdgeIds: edgePath,
      noPathFound: false,
      selfTraceError: false,
    });
  }, []);

  const handleTraceNodeClick = useCallback(
    (nodeId: string): void => {
      setTraceState((current) => {
        if (current.phase === "picking-start") {
          tracePhaseRef.current = "picking-end";
          return {
            ...TRACE_STATE_IDLE,
            phase: "picking-end",
            startNodeId: nodeId,
          };
        }
        if (current.phase === "picking-end") {
          if (current.startNodeId === nodeId) {
            // Self-trace — flag the error, stay in picking-end.
            return { ...current, selfTraceError: true };
          }
          // Schedule path compute outside the setter (which must stay pure).
          // We do this by returning early and dispatching via microtask.
          queueMicrotask(() => handleTracePathCompute(current.startNodeId!, nodeId));
          return current;
        }
        return current;
      });
    },
    [handleTracePathCompute],
  );

  /**
   * "Trace from here" entry point (slice 023 US3). Pre-fills the trace start
   * with the given node id and transitions directly to picking-end. Clears
   * search + depth like the toolbar toggle does.
   */
  const handleTraceFromHere = useCallback((nodeId: string): void => {
    setSearchQuery("");
    setSearchFocusedIndex(0);
    setDepth(3);
    tracePhaseRef.current = "picking-end";
    setTraceState({
      ...TRACE_STATE_IDLE,
      phase: "picking-end",
      startNodeId: nodeId,
    });
  }, []);

  /** Animate the Sigma camera to the given node (slice 023 trace-step click). */
  const handleTraceStepClick = useCallback((nodeId: string): void => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (sigma === null || graph === null || !graph.hasNode(nodeId)) {
      return;
    }
    const sigmaWithExtras = sigma as SigmaWithExtras;
    const camera = sigmaWithExtras.getCamera?.();
    if (camera?.animate === undefined) {
      return;
    }
    const x = graph.getNodeAttribute(nodeId, "x") as number | undefined;
    const y = graph.getNodeAttribute(nodeId, "y") as number | undefined;
    if (typeof x !== "number" || typeof y !== "number") {
      return;
    }
    const currentRatio = camera.getState?.().ratio ?? 1;
    camera.animate({ x, y, ratio: currentRatio }, { duration: CAMERA_CENTER_DURATION_MS });
  }, []);

  useEffect(() => {
    setSelectedNodeId(null);
    selectionRef.current = null;
    hoverRef.current = null;
    hoverSelectionRef.current = null;
    lastClickRef.current = null;
    setOverlaySegments([]);
  }, [edges, nodes]);

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    const colors = readThemeColors();
    const graph = buildGraph(nodes, edges, colors);

    // Degree-based size boost: hub nodes (high connectivity) render larger so
    // important call-sites and widely-imported files stand out visually.
    graph.forEachNode((nodeId) => {
      const degree = graph.degree(nodeId);
      if (degree > 1) {
        const boost = Math.min((degree - 1) * 0.35, 4);
        const s = Number(graph.getNodeAttribute(nodeId, "baseSize")) + boost;
        graph.mergeNodeAttributes(nodeId, { size: s, baseSize: s });
      }
    });

    graphRef.current = graph;

    const buildFallbackGraph = () => snapshotGraph(graph);
    const updateOverlay = (): void => {
      const activeGraph = graphRef.current;
      const sigma = sigmaRef.current;

      if (activeGraph === null || sigma === null) {
        setOverlaySegments([]);
        return;
      }

      setOverlaySegments(createOverlaySegments(activeGraph, sigma, selectionRef.current));
    };

    let sigma: Sigma | null = null;
    let observer: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const enterNodeListener = (event: { node: string }): void => {
      hoveredNodeIdRef.current = event.node;
      hoverRef.current = computeHoverNeighborhood(graph, event.node);
      hoverSelectionRef.current = computeSelection(graph, event.node, FLOW_MAX_DEPTH);
      if (sigma !== null) {
        refreshSigma(sigma);
        // Show animated edge overlay on hover when nothing is selected
        if (selectionRef.current === null) {
          setOverlaySegments(
            createOverlaySegments(graphRef.current ?? graph, sigma, hoverSelectionRef.current),
          );
        }
      }
    };

    const leaveNodeListener = (): void => {
      hoveredNodeIdRef.current = null;
      hoverRef.current = null;
      hoverSelectionRef.current = null;
      if (sigma !== null) {
        refreshSigma(sigma);
        // Restore selection overlay or clear
        if (selectionRef.current === null) {
          setOverlaySegments([]);
        } else {
          setOverlaySegments(
            createOverlaySegments(graphRef.current ?? graph, sigma, selectionRef.current),
          );
        }
      }
    };

    const navigateToNode = (nodeId: string): void => {
      const attributes = graph.getNodeAttributes(nodeId) as GraphNodeAttributes;
      onNavigate(attributes.filePath, attributes.startLine);
    };

    const selectNode = (nodeId: string): void => {
      setSelectedNodeId(nodeId);
      selectionRef.current = computeSelection(graph, nodeId, FLOW_MAX_DEPTH);

      if (sigma !== null) {
        refreshSigma(sigma);
        updateOverlay();
        if (!reducedMotion) {
          centerCameraOnNode(graph, sigma, nodeId);
        }
      }
    };

    const clearSelection = (): void => {
      if (clickTimeoutRef.current !== null) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      setSelectedNodeId(null);
      selectionRef.current = null;
      setOverlaySegments([]);

      if (sigma !== null) {
        refreshSigma(sigma);
      }
    };

    if (!canUseWebGL()) {
      sigmaRef.current = null;
      setError(null);
      setFallbackGraph(buildFallbackGraph());
      return () => {
        graphRef.current = null;
      };
    }

    try {
      if (graph.order > 0) {
        try {
          forceAtlas2.assign(graph, {
            iterations: 200,
            settings: {
              gravity: 1.8,
              scalingRatio: 6,
              slowDown: 3,
              barnesHutOptimize: true,
              barnesHutTheta: 0.5,
              linLogMode: true,
            },
          });
          stabilizeFileAnchors(graph);
        } catch (layoutError) {
          console.error("Dextree graph layout failed", layoutError);
        }
      }

      sigma = new Sigma(graph, container, {
        allowInvalidContainer: true,
        renderLabels: true,
        renderEdgeLabels: false,
        // Labels are hidden for tiny/distant nodes and revealed as the user zooms in.
        // File nodes (size 14-32) remain labelled at all zoom levels; small symbol
        // nodes (size 5-15) only show labels once they appear ≥ 4 screen-pixels wide.
        labelRenderedSizeThreshold: 4,
        defaultNodeType: "circle",
        defaultEdgeType: "line",
        defaultEdgeColor: colors.definesEdgeColor,
        enableEdgeEvents: true,
        // Prevent built-in double-click zoom — navigation is handled manually via clickNode.
        doubleClickZoomingRatio: 1,
        nodeReducer: (node, data) => {
          // 1. Node-kind filter (applied first — hides node before hover/focus logic runs)
          const attrs = data as GraphNodeAttributes;
          const kindKey = attrs.nodeKind === "file" ? "file" : (attrs.symbolKind ?? "function");
          if (hiddenNodeKindsRef.current.has(kindKey)) {
            return { ...data, hidden: true };
          }

          // 2. Depth filter (slice 022) — hide nodes outside the depth-N
          // neighbourhood of the selected/matched anchor(s).
          const depthVisible = depthVisibleNodeIdsRef.current;
          if (depthVisible !== null && !depthVisible.has(node)) {
            return { ...data, hidden: true };
          }

          // 3. Trace dimming (slice 023) — when a trace path is active,
          // off-path nodes are dimmed. Trace dimming wins over search/lens.
          if (tracePhaseRef.current === "path-active" && pathNodeIdsRef.current.size > 0) {
            if (!pathNodeIdsRef.current.has(node)) {
              return {
                ...data,
                color: dimColor(String(data.color)),
                label: "",
              };
            }
            return data;
          }

          const hover = hoverRef.current;
          const selection = selectionRef.current;
          const activeFocus = hover ?? selection;

          if (activeFocus === null || activeFocus.nodeIds.has(node)) {
            if (selection !== null && hover === null && selection.selectedNodeId === node) {
              return {
                ...data,
                size: Number(data.baseSize ?? data.size) * 1.28,
                zIndex: 2,
              };
            }

            // No hover/selection focus — apply search dimming first
            // (slice 022), then lens dimming (slice 021).  User focus always
            // wins over both.
            if (activeFocus === null) {
              const matched = matchedNodeIdsRef.current;
              if (matched.size > 0 && !matched.has(node)) {
                return {
                  ...data,
                  color: dimColor(String(data.color)),
                  label: "",
                };
              }
              const lensMatchSet = lensMatchSetRef.current;
              if (lensMatchSet !== null && !lensMatchSet.has(node)) {
                return {
                  ...data,
                  color: dimColor(String(data.color)),
                };
              }
            }

            return data;
          }

          return {
            ...data,
            color: toFadedColor(data.baseColor ?? data.color, colors.disabledColor),
            label: "",
          };
        },
        edgeReducer: (edge, data) => {
          const hover = hoverRef.current;
          const selection = selectionRef.current;
          const edgeAttrs = data as GraphEdgeAttributes;

          // Hide edges whose kind is toggled off by the filter bar.
          if (hiddenEdgeKindsRef.current.has(edgeAttrs.edgeKind)) {
            return { ...data, hidden: true };
          }

          // Trace path styling (slice 023) — on-path edges render as dashed
          // yellow; off-path edges are dimmed. Wins over hover/selection.
          if (tracePhaseRef.current === "path-active" && pathEdgeIdsRef.current.size > 0) {
            if (pathEdgeIdsRef.current.has(edge)) {
              return {
                ...data,
                color: colors.tracePathEdgeColor,
                type: "dashed",
                size: Number(data.baseSize ?? data.size) * 1.2,
                zIndex: 1,
              };
            }
            return {
              ...data,
              color: toFadedColor(data.baseColor ?? data.color, colors.disabledColor),
              size: Math.max(Number(data.baseSize ?? data.size) * 0.6, 1),
            };
          }

          const activeFocus = hover ?? selection;

          if (activeFocus === null || activeFocus.edgeIds.has(edge)) {
            if (selection !== null && hover === null && selection.edgeIds.has(edge)) {
              return {
                ...data,
                size: Number(data.baseSize ?? data.size) * 1.34,
                zIndex: 1,
              };
            }

            return data;
          }

          return {
            ...data,
            color: toFadedColor(data.baseColor ?? data.color, colors.disabledColor),
            size: Math.max(Number(data.baseSize ?? data.size) * 0.72, 1),
          };
        },
      });

      sigmaRef.current = sigma;
      applyTheme(graph, sigma, container);
      setFallbackGraph(null);
      setOverlaySegments([]);

      resizeObserver = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const cc = clusterCanvasRef.current;
        if (cc !== null) {
          cc.width = w;
          cc.height = h;
        }
        if (sigma !== null) {
          refreshSigma(sigma);
          updateOverlay();
        }
      });
      resizeObserver.observe(container);

      sigma.on("clickNode", (event) => {
        // Trace mode takes priority over normal selection (slice 023). When a
        // trace phase is waiting for a node pick, route the click to the
        // trace state machine and short-circuit normal selection.
        if (tracePhaseRef.current === "picking-start" || tracePhaseRef.current === "picking-end") {
          handleTraceNodeClick(event.node);
          return;
        }
        // Queue single-click selection; doubleClickNode cancels this if a double-click fires.
        if (clickTimeoutRef.current !== null) {
          window.clearTimeout(clickTimeoutRef.current);
        }
        lastClickRef.current = { node: event.node, time: Date.now() };
        clickTimeoutRef.current = window.setTimeout(() => {
          clickTimeoutRef.current = null;
          lastClickRef.current = null;
          selectNode(event.node);
        }, SINGLE_CLICK_DELAY_MS);
      });

      // doubleClickNode is the reliable Sigma 3 event for actual double-clicks.
      // We prevent the built-in zoom and navigate to the node instead.
      sigma.on("doubleClickNode", (event) => {
        // Cancel the pending single-click selection
        if (clickTimeoutRef.current !== null) {
          window.clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        lastClickRef.current = null;

        // Prevent Sigma's built-in double-click zoom
        const preventable = event as unknown as { preventSigmaDefault?: () => void };
        preventable.preventSigmaDefault?.();

        navigateToNode(event.node);
      });

      sigma.on("clickStage", () => {
        clearSelection();
      });

      sigma.on("enterNode", enterNodeListener);
      sigma.on("leaveNode", leaveNodeListener);

      sigma.on("afterRender", () => {
        try {
          const cc = clusterCanvasRef.current;
          if (cc !== null) {
            const hoveredFilePath =
              hoveredNodeIdRef.current !== null && graph.hasNode(hoveredNodeIdRef.current)
                ? String(
                    (graph.getNodeAttributes(hoveredNodeIdRef.current) as GraphNodeAttributes)
                      .filePath,
                  )
                : null;
            const selectedFilePath =
              selectionRef.current !== null && graph.hasNode(selectionRef.current.selectedNodeId)
                ? String(
                    (
                      graph.getNodeAttributes(
                        selectionRef.current.selectedNodeId,
                      ) as GraphNodeAttributes
                    ).filePath,
                  )
                : null;
            drawClusterHulls(graph, sigma!, cc, hoveredFilePath, selectedFilePath);
          }
          if (minimapCanvasRef.current !== null && graph.order > 20) {
            drawMinimap(graph, sigma!, minimapCanvasRef.current, container);
          }
        } catch (err) {
          console.error("Dextree cluster/minimap draw failed", err);
        }
      });

      observer = new MutationObserver(() => {
        if (sigma !== null) {
          applyTheme(graph, sigma, container);
          updateOverlay();
        }
      });
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });

      setError(null);
    } catch (err) {
      console.error("Dextree graph renderer failed", err);
      sigmaRef.current = null;
      setError(err instanceof Error ? err.message : "Could not initialize graph renderer.");
      setFallbackGraph(buildFallbackGraph());
    }

    return () => {
      if (clickTimeoutRef.current !== null) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      observer?.disconnect();
      resizeObserver?.disconnect();
      hoverRef.current = null;
      selectionRef.current = null;
      sigmaRef.current?.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [edges, nodes, onNavigate, reducedMotion]);

  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;

    selectionRef.current = computeSelection(
      graph ?? new MultiDirectedGraph(),
      selectedNodeId,
      FLOW_MAX_DEPTH,
    );

    if (graph === null || sigma === null) {
      setOverlaySegments([]);
      return;
    }

    refreshSigma(sigma);
    setOverlaySegments(createOverlaySegments(graph, sigma, selectionRef.current));
  }, [selectedNodeId]);

  // Sync hidden-edge-kinds ref so the edgeReducer (created once in the Sigma effect) can
  // read the current filter without being recreated.  Then refresh Sigma to re-run reducers.
  useEffect(() => {
    hiddenEdgeKindsRef.current = hiddenEdgeKinds;
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [hiddenEdgeKinds]);

  // Sync hidden-node-kinds ref so the nodeReducer (created once) can read current filter.
  useEffect(() => {
    hiddenNodeKindsRef.current = hiddenNodeKinds;
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [hiddenNodeKinds]);

  // Sync lens-match-set ref so the nodeReducer reads the active lens's matches
  // without being recreated. Refresh Sigma to re-run reducers.
  useEffect(() => {
    lensMatchSetRef.current = lensMatchSet;
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [lensMatchSet]);

  // Slice 022 — sync matched-node ids + depth visibility set into refs so the
  // nodeReducer reads them without being recreated. The depth-visible set is
  // the union of (selected-node depth neighbourhood) ∪ (each matched-node
  // depth neighbourhood). null means depth filter is inactive — show all.
  const depthVisibleNodeIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    matchedNodeIdsRef.current = matchedNodeIds;
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [matchedNodeIds]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!depthEnabled || graph === null) {
      depthVisibleNodeIdsRef.current = null;
    } else {
      const visible = new Set<string>();
      const anchors = matchedNodeIds.size > 0 ? Array.from(matchedNodeIds) : [selectedNodeId!];
      for (const anchor of anchors) {
        const traversal = computeSelection(graph, anchor, depth);
        if (traversal !== null) {
          for (const id of traversal.nodeIds) {
            visible.add(id);
          }
        }
      }
      depthVisibleNodeIdsRef.current = visible;
    }
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [depthEnabled, matchedNodeIds, selectedNodeId, depth]);

  // Slice 023 — sync trace path ids into refs so the nodeReducer + edgeReducer
  // can apply the path-active dimming/highlight without being recreated.
  useEffect(() => {
    tracePhaseRef.current = traceState.phase;
    pathNodeIdsRef.current = new Set(traceState.pathNodeIds);
    pathEdgeIdsRef.current = new Set(traceState.pathEdgeIds);
    const sigma = sigmaRef.current;
    if (sigma !== null) {
      refreshSigma(sigma);
    }
  }, [traceState]);

  // Slice 023 — Escape exits trace mode from any phase. Listener attached at
  // window level so it works regardless of focus (matches spec edge case
  // "Escape always exits trace mode regardless of state").
  useEffect(() => {
    if (traceState.phase === "idle") {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        handleTraceExit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [traceState.phase, handleTraceExit]);

  if (fallbackGraph !== null) {
    return <StaticGraphFallback fallbackGraph={fallbackGraph} onNavigate={onNavigate} />;
  }

  if (error !== null) {
    return (
      <div className="dxt-error" role="alert">
        <span className="codicon codicon-error" aria-hidden="true" />
        <p>Could not initialize graph renderer.</p>
      </div>
    );
  }

  const travelerSegments = overlaySegments
    .filter((segment) => segment.kind === "IMPORTS")
    .slice(0, 3);
  const fallbackTravelers =
    travelerSegments.length > 0 ? travelerSegments : overlaySegments.slice(0, 3);

  // B3: Compute callers and callees from graph during render
  const neighborCallers: Array<{ id: string; label: string; filePath: string; startLine: number }> =
    [];
  const neighborCallees: Array<{
    id: string;
    label: string;
    filePath: string;
    startLine: number;
  }> = [];

  if (selectedNodeId !== null && graphRef.current !== null) {
    const g = graphRef.current;
    if (g.hasNode(selectedNodeId)) {
      g.forEachInboundEdge(selectedNodeId, (_edge, attrs, source) => {
        if ((attrs as GraphEdgeAttributes).edgeKind !== "CALLS") return;
        const a = g.getNodeAttributes(source) as GraphNodeAttributes;
        neighborCallers.push({
          id: source,
          label: a.label,
          filePath: a.filePath,
          startLine: a.startLine,
        });
      });
      g.forEachOutboundEdge(selectedNodeId, (_edge, attrs, _src, target) => {
        if ((attrs as GraphEdgeAttributes).edgeKind !== "CALLS") return;
        const a = g.getNodeAttributes(target) as GraphNodeAttributes;
        neighborCallees.push({
          id: target,
          label: a.label,
          filePath: a.filePath,
          startLine: a.startLine,
        });
      });
    }
  }

  const MAX_NEIGHBORS = 8;
  const shownCallers = neighborCallers.slice(0, MAX_NEIGHBORS);
  const shownCallees = neighborCallees.slice(0, MAX_NEIGHBORS);
  const extraCallers = neighborCallers.length - shownCallers.length;
  const extraCallees = neighborCallees.length - shownCallees.length;

  return (
    <div className="dxt-graph-view dxt-graph-stage" data-testid="graph-view-shell">
      <LensesPanel
        activeLensId={activeLensId}
        lensCounts={lensCounts}
        onLensToggle={onLensToggle}
      />
      <div className="dxt-graph-surface">
        <canvas className="dxt-cluster-layer" ref={clusterCanvasRef} />
        <div id="dxt-graph-container" data-testid="graph-view" ref={containerRef} />
        <svg
          className="dxt-selection-overlay"
          data-testid="selection-overlay"
          aria-hidden="true"
          preserveAspectRatio="none"
        >
          {overlaySegments.map((segment) => (
            <motion.line
              key={segment.id}
              className={`dxt-selection-path${segment.kind === "IMPORTS" ? " dxt-selection-path--imports" : ""}`}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={segment.color}
              initial={false}
              {...(reducedMotion
                ? {}
                : {
                    animate: { strokeDashoffset: [-16, -2] },
                    transition: {
                      duration: 1.4,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "linear" as const,
                      delay: segment.hopIndex * 0.18,
                    },
                  })}
            />
          ))}

          {!reducedMotion
            ? fallbackTravelers.map((segment, index) => (
                <motion.circle
                  key={`${segment.id}-traveler-${index}`}
                  className="dxt-selection-traveler"
                  r={3.5}
                  fill={segment.color}
                  initial={false}
                  animate={{
                    cx: [segment.x1, segment.x2],
                    cy: [segment.y1, segment.y2],
                  }}
                  transition={{
                    duration: 1.25 + index * 0.12,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "linear",
                    delay: segment.hopIndex * 0.22,
                  }}
                />
              ))
            : null}
        </svg>

        {selectedNodeId !== null && (neighborCallers.length > 0 || neighborCallees.length > 0) && (
          <div className="dxt-neighbor-panel">
            {neighborCallers.length > 0 && (
              <div className="dxt-neighbor-section">
                <div className="dxt-neighbor-section-title">Called by</div>
                {shownCallers.map((caller) => (
                  <button
                    key={caller.id}
                    type="button"
                    className="dxt-neighbor-row"
                    onClick={() => {
                      onNavigate(caller.filePath, caller.startLine);
                    }}
                    title={`${caller.filePath}:${caller.startLine}`}
                  >
                    <span className="codicon codicon-symbol-function" aria-hidden="true" />
                    {caller.label}
                  </button>
                ))}
                {extraCallers > 0 && (
                  <span className="dxt-neighbor-more">+ {extraCallers} more</span>
                )}
              </div>
            )}
            {neighborCallees.length > 0 && (
              <div className="dxt-neighbor-section">
                <div className="dxt-neighbor-section-title">Calls</div>
                {shownCallees.map((callee) => (
                  <button
                    key={callee.id}
                    type="button"
                    className="dxt-neighbor-row"
                    onClick={() => {
                      onNavigate(callee.filePath, callee.startLine);
                    }}
                    title={`${callee.filePath}:${callee.startLine}`}
                  >
                    <span className="codicon codicon-symbol-function" aria-hidden="true" />
                    {callee.label}
                  </button>
                ))}
                {extraCallees > 0 && (
                  <span className="dxt-neighbor-more">+ {extraCallees} more</span>
                )}
              </div>
            )}
          </div>
        )}

        <GraphToolbar
          onExportMermaid={onExportMermaid}
          showMinimap={showMinimap}
          onToggleMinimap={onToggleMinimap}
          edgeKinds={ALL_EDGE_KINDS}
          hiddenEdgeKinds={hiddenEdgeKinds}
          onToggleEdgeKind={toggleEdgeKind}
          nodeFilterEntries={nodeFilterEntries}
          hiddenNodeKinds={hiddenNodeKinds}
          onToggleNodeKind={toggleNodeKind}
          searchQuery={searchQuery}
          searchResults={searchResults}
          searchFocusedIndex={searchFocusedIndex}
          onSearchQueryChange={handleSearchQueryChange}
          onSearchSelectResult={handleSearchSelectResult}
          onSearchClear={handleSearchClear}
          depth={depth}
          depthEnabled={depthEnabled}
          onDepthChange={handleDepthChange}
          tracePhase={traceState.phase}
          onTraceToggle={handleTraceToggle}
          onTraceExit={handleTraceExit}
        />
        <canvas
          className={`dxt-minimap-canvas${showMinimap ? "" : " dxt-minimap-canvas--hidden"}`}
          ref={minimapCanvasRef}
          width={128}
          height={96}
        />
        {activeLensId !== null && (
          <footer
            className={lensesPanelStyles.lensStatusBar}
            data-testid="lens-status-bar"
            role="contentinfo"
          >
            <span className={lensesPanelStyles.lensPill}>
              <span
                className={`codicon codicon-${LENS_REGISTRY[activeLensId].iconKey}`}
                aria-hidden="true"
              />
              {`Lens: ${LENS_REGISTRY[activeLensId].title}`}
            </span>
          </footer>
        )}
        {traceState.phase !== "idle" && (
          <TraceBanner
            state={traceState}
            startLabel={
              traceState.startNodeId === null
                ? null
                : (nodes.find((n) => n.id === traceState.startNodeId)?.label ?? null)
            }
            endLabel={
              traceState.endNodeId === null
                ? null
                : (nodes.find((n) => n.id === traceState.endNodeId)?.label ?? null)
            }
            onExit={handleTraceExit}
          />
        )}
      </div>
      {traceState.phase === "path-active" ? (
        <TraceInspector
          tracePath={
            graphRef.current === null ? null : computeTracePath(graphRef.current, traceState)
          }
          noPathFound={traceState.noPathFound}
          startLabel={
            traceState.startNodeId === null
              ? null
              : (nodes.find((n) => n.id === traceState.startNodeId)?.label ?? null)
          }
          endLabel={
            traceState.endNodeId === null
              ? null
              : (nodes.find((n) => n.id === traceState.endNodeId)?.label ?? null)
          }
          onStepClick={handleTraceStepClick}
        />
      ) : (
        <InspectorPanel
          selectedNode={
            selectedNodeId === null ? null : (nodes.find((n) => n.id === selectedNodeId) ?? null)
          }
          onTraceFromHere={traceState.phase === "idle" ? handleTraceFromHere : undefined}
        />
      )}
    </div>
  );
}
