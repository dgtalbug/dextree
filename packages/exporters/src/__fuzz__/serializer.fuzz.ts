/**
 * Fuzz target for the Mermaid serializer.
 *
 * Jazzer.js calls `fuzz(data)` with arbitrary byte buffers. We decode the
 * buffer as UTF-8 and treat it as a synthetic node label / edge kind, then
 * assert the serializer never throws and always returns a non-empty string.
 *
 * Run locally:
 *   npx jazzer packages/exporters/dist/__fuzz__/serializer.fuzz.js
 */
import { DEFAULT_MERMAID_THEME } from "../mermaid/theme.js";
import { serializeToMermaid } from "../mermaid/serializer.js";
import type { WorkspaceSubgraph } from "@dextree/core";

export function fuzz(data: Buffer): void {
  const text = data.toString("utf8");
  if (text.length === 0) return;

  const subgraph: WorkspaceSubgraph = {
    nodes: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        label: text,
        type: "file",
        filePath: "/fuzz/test.ts",
        startLine: 1,
      },
    ],
    edges: [],
  };

  const result = serializeToMermaid(subgraph, { theme: DEFAULT_MERMAID_THEME });

  if (typeof result !== "string" || result.length === 0) {
    throw new Error("serializer returned empty or non-string output");
  }
}
