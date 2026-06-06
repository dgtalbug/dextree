import { type KeyboardEvent } from "react";

import type { FallbackGraph, FallbackNode } from "./graphViewTypes.js";

/**
 * The no-WebGL fallback rendering of the graph: a static SVG of nodes/edges plus
 * a textual relations list. Used when WebGL is unavailable (so Sigma cannot
 * render). Purely presentational — it takes a snapshot graph and a navigate
 * callback and holds no state of its own.
 */

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

export function StaticGraphFallback({
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
