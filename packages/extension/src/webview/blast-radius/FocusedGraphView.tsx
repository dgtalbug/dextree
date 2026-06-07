import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import type React from "react";
import { useMemo } from "react";

import "@xyflow/react/dist/style.css";

import type { GraphEdge, GraphNode } from "@dextree/core";

import type { SelectionTraversal, ThemeColors } from "../components/graphViewTypes.js";
import { focusedEdgeStyle } from "./edgeStyles.js";
import { buildFocusedGraphModel } from "./focusedGraphModel.js";
import { computeFocusedLayout } from "./focusedLayout.js";
import { SymbolNode } from "./SymbolNode.js";
import styles from "./FocusedGraphView.module.css";

/**
 * The React Flow focused view: a node's neighbourhood as boxed cards with routed
 * edges. Pure-model-driven — `buildFocusedGraphModel` / `computeFocusedLayout` /
 * `focusedEdgeStyle` (all unit-tested without this runtime) decide *what* and
 * *where*; this component only maps those into React Flow's `Node`/`Edge` shapes
 * and renders the canvas. The only `@xyflow/react` import lives here + SymbolNode,
 * confined to blast-radius/ by ESLint (RULE-ARCH-002).
 */

const nodeTypes = { symbol: SymbolNode };

export interface FocusedGraphViewProps {
  graphNodes: readonly GraphNode[];
  graphEdges: readonly GraphEdge[];
  traversal: SelectionTraversal;
  colors: ThemeColors;
}

export function FocusedGraphView({
  graphNodes,
  graphEdges,
  traversal,
  colors,
}: FocusedGraphViewProps): React.ReactElement {
  const { nodes, edges, truncatedCount } = useMemo(() => {
    const model = buildFocusedGraphModel(graphNodes, graphEdges, traversal);
    const positions = computeFocusedLayout(model.nodes);

    const rfNodes: Node[] = model.nodes.map((n) => ({
      id: n.id,
      type: "symbol",
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: n as unknown as Record<string, unknown>,
    }));

    const rfEdges: Edge[] = model.edges.map((e) => {
      const style = focusedEdgeStyle(e, colors);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: style.type,
        style: { stroke: style.color, strokeWidth: style.strokeWidth },
        ...(style.markerEnd
          ? { markerEnd: { type: MarkerType.ArrowClosed, color: style.color } }
          : {}),
      };
    });

    return { nodes: rfNodes, edges: rfEdges, truncatedCount: model.truncatedCount };
  }, [graphNodes, graphEdges, traversal, colors]);

  return (
    <ReactFlowProvider>
      <div className={styles.canvas} data-testid="focused-graph-view">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
        {truncatedCount > 0 ? (
          <div className={styles.truncationNotice} data-testid="focused-truncation">
            Showing the {nodes.length} most relevant nodes; {truncatedCount} more hidden.
          </div>
        ) : null}
      </div>
    </ReactFlowProvider>
  );
}
