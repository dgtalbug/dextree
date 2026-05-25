import type { WorkspaceSubgraph } from "@dextree/core";

import { serializeToScopedMermaid } from "./scopedSerializer.js";
import type { MermaidTheme } from "./theme.js";

export interface MermaidSerializeOptions {
  /** Theme applied as the Mermaid %%{init}%% directive. */
  theme: MermaidTheme;
}

/**
 * Slice-016 compatibility shim. Delegates to {@link serializeToScopedMermaid}
 * with the workspace / symbol / auto defaults.
 *
 * Preserves two slice-016 invariants that the new scoped path does not
 * guarantee on its own:
 *
 *  1. Throws `Error("Graph has no nodes to export")` on an empty workspace
 *     subgraph (the fuzz target asserts this exact message).
 *  2. Emits `graph TD` as the second line (Mermaid alias of `graph TB`) so
 *     existing snapshot tests stay byte-identical.
 *
 * Slated for removal in slice 029 once the preview panel becomes the only
 * consumer of the legacy entry point.
 */
export function serializeToMermaid(
  subgraph: WorkspaceSubgraph,
  opts: MermaidSerializeOptions,
): string {
  if (subgraph.nodes.length === 0) {
    throw new Error("Graph has no nodes to export");
  }

  const output = serializeToScopedMermaid(subgraph, {
    diagram: "flowchart",
    scope: { kind: "workspace" },
    granularity: "symbol",
    direction: "auto",
    theme: opts.theme,
  });

  return output.replace(/^graph TB$/m, "graph TD");
}
