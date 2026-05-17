import type { GraphEdge, GraphNode } from "@dextree/core";
import { MultiDirectedGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { useEffect, useRef, useState } from "react";
import Sigma from "sigma";

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
}

interface FallbackGraph {
  nodes: FallbackNode[];
  edges: FallbackEdge[];
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
      type: node.type,
      x,
      y,
      size: node.type === "file" ? 12 : 6,
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
        kind: edge.kind,
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
      type: GraphNode["type"];
    };

    return {
      id: nodeId,
      label: attributes.label,
      filePath: attributes.filePath,
      startLine: attributes.startLine,
      x: Number.isFinite(attributes.x) ? attributes.x : 0,
      y: Number.isFinite(attributes.y) ? attributes.y : 0,
      color: attributes.color,
      type: attributes.type,
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
  }));

  return {
    nodes: positionedNodes,
    edges,
  };
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
      <div className="dxt-fallback-banner">
        <span className="codicon codicon-graph-line" aria-hidden="true" />
        <p>Interactive WebGL renderer was unavailable. Showing a simplified graph preview.</p>
      </div>

      <div className="dxt-fallback-surface">
        <svg className="dxt-fallback-edges" viewBox="0 0 100 100" preserveAspectRatio="none">
          {fallbackGraph.edges.map((edge) => {
            const source = nodesById.get(edge.source);
            const target = nodesById.get(edge.target);

            if (source === undefined || target === undefined) {
              return null;
            }

            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={edge.color}
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {fallbackGraph.nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className={`dxt-fallback-node dxt-fallback-node-${node.type}`}
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              borderColor: node.color,
              color: node.color,
            }}
            onClick={() => onNavigate(node.filePath, node.startLine)}
          >
            {node.label}
          </button>
        ))}
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
      attributes.type === "file" ? colors.fileNodeColor : colors.symbolNodeColor,
    );
  });

  graph.forEachEdge((edge, attributes) => {
    graph.setEdgeAttribute(edge, "color", edgeColor(attributes.kind as GraphEdge["kind"], colors));
  });

  applySigmaSetting(sigma, "labelColor", { color: colors.labelColor });
  applySigmaSetting(sigma, "defaultNodeColor", colors.symbolNodeColor);
  applySigmaSetting(sigma, "defaultEdgeColor", colors.definesEdgeColor);
  refreshSigma(sigma);
}

export function GraphView({ nodes, edges, onNavigate }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
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
        renderLabels: true,
        labelRenderedSizeThreshold: 0,
      });

      applyTheme(graph, sigma, container);
      setFallbackGraph(null);

      sigma.on("clickNode", (event) => {
        const attributes = graph.getNodeAttributes(event.node) as {
          filePath: string;
          startLine: number;
        };
        onNavigate(attributes.filePath, attributes.startLine);
      });

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
      setError(err instanceof Error ? err.message : "Could not initialize graph renderer.");
      setFallbackGraph(buildFallbackGraph());
    }

    return () => {
      observer?.disconnect();
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
