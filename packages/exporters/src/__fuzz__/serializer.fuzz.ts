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
import type { WorkspaceSubgraph } from "@dextree/core";

import { DEFAULT_MERMAID_THEME } from "../mermaid/theme.js";
import {
  serializeToScopedMermaid,
  validateScopedMermaidExport,
  type MermaidDirection,
  type MermaidGranularity,
  type MermaidScope,
} from "../mermaid/scopedSerializer.js";
import { serializeToMermaid } from "../mermaid/serializer.js";

const GRANULARITIES: MermaidGranularity[] = ["package", "file", "symbol"];
const DIRECTIONS: MermaidDirection[] = ["auto", "TB", "LR", "BT", "RL"];

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
    frameworks: [],
  };

  // Legacy slice-016 path — must still throw only on empty (covered upstream).
  const legacy = serializeToMermaid(subgraph, { theme: DEFAULT_MERMAID_THEME });
  if (typeof legacy !== "string" || legacy.length === 0) {
    throw new Error("legacy serializer returned empty or non-string output");
  }

  // Slice-027 scoped entry. Derive option axes from the input bytes so each
  // fuzz iteration explores a different point in the discriminated-union
  // option space. The contract: serializeToScopedMermaid throws iff
  // validateScopedMermaidExport (or extractMermaidScope) reports non-ok,
  // and never produces empty output otherwise.
  const granularity = GRANULARITIES[data.length % GRANULARITIES.length] ?? "symbol";
  const direction = DIRECTIONS[(data[0] ?? 0) % DIRECTIONS.length] ?? "auto";

  const scopes: MermaidScope[] = [
    { kind: "workspace" },
    { kind: "file", relativePath: "/fuzz/test.ts" },
    { kind: "file", relativePath: text.slice(0, 64) },
  ];

  for (const scope of scopes) {
    const validation = validateScopedMermaidExport(subgraph, granularity);
    let threw = false;
    let scoped = "";
    try {
      scoped = serializeToScopedMermaid(subgraph, {
        diagram: "flowchart",
        scope,
        granularity,
        direction,
        theme: DEFAULT_MERMAID_THEME,
      });
    } catch {
      threw = true;
    }

    // Invariant: throws must correspond to non-ok validation or unsupported
    // scope extraction. The `file` scopes against a non-matching relativePath
    // legitimately throw via the `unsupported` extraction path.
    if (!threw && validation.status !== "ok") {
      throw new Error(
        `scoped serializer returned a string when validation.status=${validation.status}`,
      );
    }
    if (!threw && (typeof scoped !== "string" || scoped.length === 0)) {
      throw new Error("scoped serializer returned empty or non-string output");
    }
  }
}
