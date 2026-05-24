import type { GraphNode, WorkspaceSubgraph } from "@dextree/core";
import { MERMAID_INIT_DIRECTIVE, type MermaidTheme } from "./theme.js";

export interface MermaidSerializeOptions {
  /** Theme applied as the Mermaid %%{init}%% directive. */
  theme: MermaidTheme;
}

/**
 * Convert a node's UUID to a safe Mermaid identifier.
 * Mermaid disallows hyphens in bare node IDs, so we prefix with 'n'
 * and replace all hyphens with underscores.
 */
function toSafeId(id: string): string {
  return "n" + id.replace(/-/g, "_");
}

/** Escape characters that would break the Mermaid "..." label syntax. */
function escapeLabel(text: string): string {
  return text
    .replace(/&/g, "#amp;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;");
}

function nodeLabel(node: GraphNode): string {
  if (node.type === "symbol" && node.symbolKind !== undefined) {
    return `${escapeLabel(node.label)} [${node.symbolKind}]`;
  }
  return escapeLabel(node.label);
}

/**
 * Serialize the workspace subgraph into a valid Mermaid `graph TD` document.
 *
 * Guarantees:
 * - Pure function: same inputs → same output (deterministic, FR-012).
 * - First line is the %%{init}%% theme directive.
 * - Edges referencing unknown node IDs are silently dropped (FR-009).
 * - Throws if `subgraph.nodes` is empty.
 */
export function serializeToMermaid(
  subgraph: WorkspaceSubgraph,
  opts: MermaidSerializeOptions,
): string {
  if (subgraph.nodes.length === 0) {
    throw new Error("Graph has no nodes to export");
  }

  const lines: string[] = [];

  // Theme directive — must be first line.
  lines.push(MERMAID_INIT_DIRECTIVE[opts.theme]);
  lines.push("graph TD");

  // Build node id set for edge validation.
  const nodeIds = new Set(subgraph.nodes.map((n) => n.id));

  // Sort nodes deterministically by id (FR-012).
  const sortedNodes = [...subgraph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  for (const node of sortedNodes) {
    lines.push(`  ${toSafeId(node.id)}["${nodeLabel(node)}"]`);
  }

  // Sort edges deterministically by source+target+kind (FR-012).
  const sortedEdges = [...subgraph.edges].sort((a, b) => {
    const keyA = `${a.source}\0${a.target}\0${a.kind}`;
    const keyB = `${b.source}\0${b.target}\0${b.kind}`;
    return keyA.localeCompare(keyB);
  });

  for (const edge of sortedEdges) {
    // Silently skip edges whose source or target is not in the node set (FR-009).
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    lines.push(`  ${toSafeId(edge.source)} -->|${edge.kind}| ${toSafeId(edge.target)}`);
  }

  return lines.join("\n");
}
