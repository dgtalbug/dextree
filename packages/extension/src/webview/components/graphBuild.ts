import type { GraphEdge, GraphNode } from "@dextree/core";
import { MultiDirectedGraph } from "graphology";

import {
  entryVisualState,
  type FallbackGraph,
  type GraphEdgeAttributes,
  type GraphNodeAttributes,
  type ThemeColors,
} from "./graphViewTypes.js";

/**
 * Pure graph-construction and node/edge styling for the GraphView: turning the
 * workspace `GraphNode[]`/`GraphEdge[]` into a styled graphology graph, the
 * colour/size math behind each node and edge, the clustered initial layout, and
 * the static-fallback snapshot. No React, no Sigma instance, no DOM — every
 * function here is deterministic given its arguments, so they live outside the
 * component and are unit testable in isolation.
 */

/** Opacity applied to faded (dimmed) nodes/edges so only the focused cluster reads. */
export const FADE_ALPHA = 0.06;

const FILE_SIZE_RANGE = { min: 14, max: 28, base: 16 } as const;
const SYMBOL_SIZE_RANGE = { min: 5, max: 15, base: 7 } as const;
const METHOD_SIZE_RANGE = { min: 3, max: 9, base: 4 } as const;

/** Fade a colour to {@link FADE_ALPHA}, accepting `rgb[a]()` or `#rrggbb`. */
export function toFadedColor(color: unknown, fallbackColor: string): string {
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

/** Map an edge kind to its themed colour (falls back to the DEFINES colour). */
export function edgeColor(kind: GraphEdge["kind"], colors: ThemeColors): string {
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

/** Map an edge kind to its rendered line width. */
export function edgeSize(kind: GraphEdge["kind"]): number {
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

/** Map a node to its themed colour by file/symbol kind. */
export function symbolColor(node: GraphNode, colors: ThemeColors): string {
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

/**
 * Seed initial node positions: files spread evenly on a large outer ring, each
 * file's symbols fanned in a tight arc around it, orphan symbols on an inner
 * ring. ForceAtlas2 then pulls each cluster together, keeping symbols near their
 * file.
 */
export function buildInitialPositions(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
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

/**
 * Mix an edge color at `ratio` opacity against a background color to produce
 * a faint-but-solid hex color that looks "dotted/ghost" without relying on
 * WebGL per-pixel alpha blending (which Sigma 3 uses premultiplied mode for,
 * making naive rgba() colors appear brighter rather than transparent).
 */
export function mixWithBackground(color: string, bgColor: string, ratio: number): string {
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

/** Min/max of the finite `importance` scores across nodes (for size scaling). */
export function computeSizeBounds(nodes: GraphNode[]): { min: number; max: number } {
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

/** Scale a node's rendered size within its kind's range by its importance. */
export function sizeForNode(node: GraphNode, bounds: { min: number; max: number }): number {
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

/**
 * Build a styled graphology graph from the workspace nodes/edges: dedupes ids,
 * assigns clustered initial positions, and stamps colour/size/entry-styling
 * attributes. Skips blank/duplicate ids and edges whose endpoints are absent.
 */
export function buildGraph(
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

    // Entry styling applies only to symbol nodes — guards against payload
    // drift across the host-webview boundary where the upstream contract
    // (file nodes never carry entry/layer classification) could regress.
    const isSymbol = node.type === "symbol";
    const visual = entryVisualState(isSymbol ? node.entryKind : undefined);

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
      ...(isSymbol && node.entryKind !== undefined ? { entryKind: node.entryKind } : {}),
      ...(isSymbol && node.archLayer !== undefined ? { archLayer: node.archLayer } : {}),
      ...(visual.usesEntryBorder
        ? { type: "entry" as const, entryBorderColor: colors.entryBorderColor }
        : {}),
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

/**
 * Nudge file nodes radially outward from the graph centroid so file clusters
 * separate after the force layout settles, keeping inter-file structure legible.
 */
export function stabilizeFileAnchors(graph: MultiDirectedGraph): void {
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

/**
 * Capture a normalised snapshot of the live graph for the static (no-WebGL)
 * fallback: positions are projected into a small fixed viewport box.
 */
export function snapshotGraph(graph: MultiDirectedGraph): FallbackGraph {
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
