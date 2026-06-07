import { edgeColor } from "../components/graphBuild.js";
import type { ThemeColors } from "../components/graphViewTypes.js";

import type { FocusedEdge } from "./focusedGraphModel.js";

/**
 * Per-relation edge styling for the focused view. Reuses `edgeColor` (the single
 * source of truth shared with the Sigma view) for the base colour, and adds the
 * React-Flow-specific bits: a routed edge type and direction-aware emphasis for
 * the focus node's callers (inbound) vs callees (outbound). Pure — returns a
 * plain style descriptor, no `@xyflow/react` import; `FocusedGraphView` maps it
 * onto a React Flow edge.
 */

export interface FocusedEdgeStyle {
  /** React Flow edge type — routed so edges bend around cards, not through them. */
  type: "smoothstep";
  color: string;
  strokeWidth: number;
  /** Show an arrowhead so direction reads (CALLS source→target, etc.). */
  markerEnd: boolean;
}

const EMPHASISED_WIDTH = 2.5;
const BASE_WIDTH = 1.5;

/**
 * Style a focused-view edge. Edges touching the focus node are emphasised and,
 * for CALLS, coloured by direction (caller vs callee) — mirroring the Sigma
 * reducer's direction-aware emphasis. All other edges use their relation colour.
 */
export function focusedEdgeStyle(edge: FocusedEdge, colors: ThemeColors): FocusedEdgeStyle {
  const emphasised = edge.direction !== "other";

  let color = edgeColor(edge.kind, colors);
  if (edge.kind === "CALLS") {
    if (edge.direction === "inbound") color = colors.callerEdgeColor;
    else if (edge.direction === "outbound") color = colors.calleeEdgeColor;
  }

  return {
    type: "smoothstep",
    color,
    strokeWidth: emphasised ? EMPHASISED_WIDTH : BASE_WIDTH,
    markerEnd: true,
  };
}
