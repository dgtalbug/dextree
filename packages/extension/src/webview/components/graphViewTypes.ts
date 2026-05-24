import type { GraphEdge, GraphNode, SymbolKind } from "@dextree/core";

export interface ThemeColors {
  backgroundColor: string;
  labelColor: string;
  disabledColor: string;
  fileNodeColor: string;
  symbolKindColors: Record<SymbolKind | "default", string>;
  definesEdgeColor: string;
  importsEdgeColor: string;
  callsEdgeColor: string;
  inheritsEdgeColor: string;
  instantiatesEdgeColor: string;
}

export interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNavigate: (filePath: string, line: number) => void;
  onExportMermaid: () => void;
}

export interface GraphNodeAttributes {
  label: string;
  filePath: string;
  startLine: number;
  nodeKind: GraphNode["type"];
  symbolKind?: GraphNode["symbolKind"];
  x: number;
  y: number;
  size: number;
  baseSize: number;
  color: string;
  baseColor: string;
}

export interface GraphEdgeAttributes {
  edgeKind: GraphEdge["kind"];
  color: string;
  baseColor: string;
  size: number;
  baseSize: number;
}

export interface FallbackNode {
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

export interface FallbackGraph {
  nodes: FallbackNode[];
  edges: FallbackEdge[];
}

export interface SelectionTraversal {
  selectedNodeId: string;
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  orderedEdgeIds: string[];
  hopLayers: string[][];
}

export interface OverlaySegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  kind: GraphEdge["kind"];
  hopIndex: number;
}

export interface SigmaNodeDisplayData {
  x: number;
  y: number;
  hidden?: boolean;
}
