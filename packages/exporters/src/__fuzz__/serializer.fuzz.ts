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
import type { GraphNode, WorkspaceSubgraph } from "@dextree/core";

import { validateClassDiagramExport } from "../mermaid/classDiagram.js";
import { DEFAULT_MERMAID_THEME } from "../mermaid/theme.js";
import {
  clampGranularityToScope,
  serializeToScopedMermaid,
  validateScopedMermaidExport,
  type MermaidDiagram,
  type MermaidDirection,
  type MermaidGranularity,
  type MermaidScope,
} from "../mermaid/scopedSerializer.js";
import { serializeToMermaid } from "../mermaid/serializer.js";

const GRANULARITIES: MermaidGranularity[] = ["package", "file", "symbol"];
const DIRECTIONS: MermaidDirection[] = ["auto", "TB", "LR", "BT", "RL"];
const DIAGRAMS: MermaidDiagram[] = ["flowchart", "classDiagram"];

export function fuzz(data: Buffer): void {
  const text = data.toString("utf8");
  if (text.length === 0) return;

  // Always include one class-like symbol so the classDiagram branch has a
  // non-empty in-scope class set for at least some iterations. The label is
  // the fuzz input so the serializer's name-sanitization is exercised too.
  const classNode: GraphNode = {
    id: "22222222-2222-2222-2222-222222222222",
    label: text.slice(0, 32) || "FuzzClass",
    type: "symbol",
    filePath: "/fuzz/test.ts",
    startLine: 1,
    symbolKind: "class",
  };
  const subgraph: WorkspaceSubgraph = {
    nodes: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        label: text,
        type: "file",
        filePath: "/fuzz/test.ts",
        startLine: 1,
      },
      classNode,
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
  const diagram = DIAGRAMS[(data[1] ?? 0) % DIAGRAMS.length] ?? "flowchart";

  const scopes: MermaidScope[] = [
    { kind: "workspace" },
    { kind: "file", relativePath: "/fuzz/test.ts" },
    { kind: "file", relativePath: text.slice(0, 64) },
    // Visible scope: a real node id plus the fuzz text as a (usually unknown)
    // id, so both the present-node path and unknown-id filtering are exercised.
    // Always extracts ok (never unsupported), so the flowchart oracle applies.
    {
      kind: "visible",
      nodeIds: ["22222222-2222-2222-2222-222222222222", text.slice(0, 64)],
      edgeIds: [],
    },
    // Empty visible set — must still serialize without throwing on empty.
    { kind: "visible", nodeIds: [], edgeIds: [] },
  ];

  for (const scope of scopes) {
    let threw = false;
    let scoped = "";
    try {
      scoped = serializeToScopedMermaid(subgraph, {
        diagram,
        scope,
        granularity,
        direction,
        theme: DEFAULT_MERMAID_THEME,
      });
    } catch {
      threw = true;
    }

    if (diagram === "flowchart") {
      // Flowchart branch: throws must correspond to non-ok validation or
      // unsupported scope extraction. The `file` scopes against a
      // non-matching relativePath legitimately throw via the `unsupported`
      // extraction path. The oracle mirrors the serializer's workspace
      // granularity floor so its cap prediction matches what runs.
      const effectiveGranularity = clampGranularityToScope(scope, granularity);
      const flowValidation = validateScopedMermaidExport(subgraph, effectiveGranularity);
      if (!threw && flowValidation.status !== "ok") {
        throw new Error(
          `scoped serializer returned a string when validation.status=${flowValidation.status}`,
        );
      }
      if (!threw && (typeof scoped !== "string" || scoped.length === 0)) {
        throw new Error("scoped serializer (flowchart) returned empty or non-string output");
      }
    } else {
      // ClassDiagram branch: throws iff validateClassDiagramExport reports
      // non-ok (file-scope unsupported extraction is bypassed because the
      // classDiagram path validates the full subgraph directly).
      const classValidation = validateClassDiagramExport(subgraph);
      if (!threw && classValidation.status !== "ok") {
        throw new Error(
          `classDiagram serializer returned a string when validation.status=${classValidation.status}`,
        );
      }
      if (!threw && (typeof scoped !== "string" || scoped.length === 0)) {
        throw new Error("classDiagram serializer returned empty or non-string output");
      }
    }
  }
}
