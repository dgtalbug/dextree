import type { GraphEdge, GraphNode } from "@dextree/core";
import { MultiDirectedGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import Sigma from "sigma";

import { computeHoverNeighborhood, type HoverNeighborhood } from "./graphHover.js";

const FADE_ALPHA = 0.15;

function toFadedColor(color: unknown): string {
  if (typeof color !== "string" || color.length === 0) {
    return `rgba(128, 128, 128, ${FADE_ALPHA})`;
  }

  const rgbaMatch = color.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
  if (rgbaMatch !== null) {
    return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${FADE_ALPHA})`;
  }

  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch !== null) {
    const hex = hexMatch[1] as string;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${FADE_ALPHA})`;
  }

  return `rgba(128, 128, 128, ${FADE_ALPHA})`;
}

interface ThemeColors {
  backgroundColor: string;
  labelColor: string;
  fileNodeColor: string;
  symbolNodeColor: string;
  definesEdgeColor: string;
  importsEdgeColor: string;
  callsEdgeColor: string;
}

interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNavigate: (filePath: string, line: number) => void;
}

interface FallbackNode {
  id: string;
  label: string;
  filePath: string;
  startLine: number;
  x: number;
  y: number;
  color: string;
  type: GraphNode["type"];
}

interface FallbackEdge {
  id: string;
  source: string;
  target: string;
  color: string;
  kind: GraphEdge["kind"];
}

interface FallbackGraph {
  nodes: FallbackNode[];
  edges: FallbackEdge[];
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
  const foreground = styles.getPropertyValue("--vscode-foreground").trim() || "#cccccc";

  return {
    backgroundColor: styles.getPropertyValue("--vscode-editor-background").trim() || "transparent",
    labelColor: foreground,
    fileNodeColor:
      styles.getPropertyValue("--vscode-symbolIcon-fileForeground").trim() || foreground,
    symbolNodeColor:
      styles.getPropertyValue("--vscode-symbolIcon-classForeground").trim() || foreground,
    definesEdgeColor: styles.getPropertyValue("--vscode-charts-blue").trim() || foreground,
    importsEdgeColor: styles.getPropertyValue("--vscode-charts-green").trim() || foreground,
    callsEdgeColor: styles.getPropertyValue("--vscode-charts-orange").trim() || foreground,
  };
}

function edgeColor(kind: GraphEdge["kind"], colors: ThemeColors): string {
  switch (kind) {
    case "DEFINES":
      return colors.definesEdgeColor;
    case "IMPORTS":
      return colors.importsEdgeColor;
    case "CALLS":
      return colors.callsEdgeColor;
    default:
      return colors.definesEdgeColor;
  }
}

function initialPosition(
  index: number,
  totalNodes: number,
  nodeType: GraphNode["type"],
): { x: number; y: number } {
  const angle = (index / Math.max(totalNodes, 1)) * Math.PI * 2;
  const radius = nodeType === "file" ? 1 : 0.7;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

const FILE_SIZE_RANGE = { min: 10, max: 22, base: 12 } as const;
const SYMBOL_SIZE_RANGE = { min: 4, max: 14, base: 6 } as const;

function computeSizeBounds(nodes: GraphNode[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    if (typeof node.importance === "number" && Number.isFinite(node.importance)) {
      if (node.importance < min) min = node.importance;
      if (node.importance > max) max = node.importance;
    }
  }
  return { min, max };
}

function sizeForNode(node: GraphNode, bounds: { min: number; max: number }): number {
  const range = node.type === "file" ? FILE_SIZE_RANGE : SYMBOL_SIZE_RANGE;
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
  const totalNodes = Math.max(nodes.length, 1);
  const seenNodeIds = new Set<string>();
  const seenEdgeIds = new Set<string>();
  let generatedEdgeIndex = 0;
  const importanceBounds = computeSizeBounds(nodes);

  for (const [index, node] of nodes.entries()) {
    if (node.id.trim() === "" || seenNodeIds.has(node.id)) {
      continue;
    }

    const { x, y } = initialPosition(index, totalNodes, node.type);
    seenNodeIds.add(node.id);

    graph.addNode(node.id, {
      label: node.label.trim() || node.filePath.split("/").pop() || node.id,
      filePath: node.filePath,
      startLine: Number.isFinite(node.startLine) ? node.startLine : 1,
      nodeKind: node.type,
      x,
      y,
      size: sizeForNode(node, importanceBounds),
      color: node.type === "file" ? colors.fileNodeColor : colors.symbolNodeColor,
    });
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
      graph.addEdgeWithKey(edgeId, edge.source, edge.target, {
        edgeKind: edge.kind,
        color: edgeColor(edge.kind, colors),
      });
    } catch {
      continue;
    }
  }

  return graph;
}

function snapshotGraph(graph: MultiDirectedGraph): FallbackGraph {
  const nodes = graph.nodes().map((nodeId) => {
    const attributes = graph.getNodeAttributes(nodeId) as {
      label: string;
      filePath: string;
      startLine: number;
      x: number;
      y: number;
      color: string;
      nodeKind: GraphNode["type"];
    };

    return {
      id: nodeId,
      label: attributes.label,
      filePath: attributes.filePath,
      startLine: attributes.startLine,
      x: Number.isFinite(attributes.x) ? attributes.x : 0,
      y: Number.isFinite(attributes.y) ? attributes.y : 0,
      color: attributes.color,
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
    color: String(graph.getEdgeAttribute(edgeId, "color")),
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
    <div className="dxt-fallback-graph" data-testid="graph-view-fallback">
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
    graph.setNodeAttribute(
      node,
      "color",
      attributes.nodeKind === "file" ? colors.fileNodeColor : colors.symbolNodeColor,
    );
  });

  graph.forEachEdge((edge, attributes) => {
    graph.setEdgeAttribute(
      edge,
      "color",
      edgeColor(attributes.edgeKind as GraphEdge["kind"], colors),
    );
  });

  applySigmaSetting(sigma, "labelColor", { color: colors.labelColor });
  applySigmaSetting(sigma, "defaultNodeColor", colors.symbolNodeColor);
  applySigmaSetting(sigma, "defaultEdgeColor", colors.definesEdgeColor);
  refreshSigma(sigma);
}

export function GraphView({ nodes, edges, onNavigate }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<HoverNeighborhood | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbackGraph, setFallbackGraph] = useState<FallbackGraph | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    const colors = readThemeColors();
    const graph = buildGraph(nodes, edges, colors);
    const buildFallbackGraph = () => snapshotGraph(graph);

    let sigma: Sigma | null = null;
    let observer: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const enterNodeListener = (event: { node: string }): void => {
      hoverRef.current = computeHoverNeighborhood(graph, event.node);
      if (sigma !== null) {
        refreshSigma(sigma);
      }
    };
    const leaveNodeListener = (): void => {
      hoverRef.current = null;
      if (sigma !== null) {
        refreshSigma(sigma);
      }
    };

    if (!canUseWebGL()) {
      setError(null);
      setFallbackGraph(buildFallbackGraph());
      return;
    }

    try {
      if (graph.order > 0) {
        try {
          forceAtlas2.assign(graph, {
            iterations: 50,
            settings: {
              gravity: 1,
              scalingRatio: 10,
              slowDown: 1.5,
            },
          });
        } catch (layoutError) {
          console.error("Dextree graph layout failed", layoutError);
        }
      }

      sigma = new Sigma(graph, container, {
        allowInvalidContainer: true,
        renderLabels: true,
        renderEdgeLabels: false,
        labelRenderedSizeThreshold: 0,
        defaultNodeType: "circle",
        defaultEdgeType: "line",
        defaultEdgeColor: "#888888",
        nodeReducer: (node, data) => {
          const hover = hoverRef.current;
          if (hover === null || hover.nodeIds.has(node)) {
            return data;
          }
          return { ...data, color: toFadedColor(data.color) };
        },
        edgeReducer: (edge, data) => {
          const hover = hoverRef.current;
          if (hover === null || hover.edgeIds.has(edge)) {
            return data;
          }
          return { ...data, color: toFadedColor(data.color) };
        },
      });

      applyTheme(graph, sigma, container);
      setFallbackGraph(null);

      resizeObserver = new ResizeObserver(() => {
        if (sigma !== null) {
          refreshSigma(sigma);
        }
      });
      resizeObserver.observe(container);

      sigma.on("clickNode", (event) => {
        const attributes = graph.getNodeAttributes(event.node) as {
          filePath: string;
          startLine: number;
        };
        onNavigate(attributes.filePath, attributes.startLine);
      });

      sigma.on("enterNode", enterNodeListener);
      sigma.on("leaveNode", leaveNodeListener);

      observer = new MutationObserver(() => {
        if (sigma !== null) {
          applyTheme(graph, sigma, container);
        }
      });
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });

      setError(null);
    } catch (err) {
      console.error("Dextree graph renderer failed", err);
      setError(err instanceof Error ? err.message : "Could not initialize graph renderer.");
      setFallbackGraph(buildFallbackGraph());
    }

    return () => {
      observer?.disconnect();
      resizeObserver?.disconnect();
      hoverRef.current = null;
      sigma?.kill();
    };
  }, [edges, nodes, onNavigate]);

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

  return (
    <div className="dxt-graph-view" data-testid="graph-view-shell">
      <div id="dxt-graph-container" data-testid="graph-view" ref={containerRef} />
    </div>
  );
}
