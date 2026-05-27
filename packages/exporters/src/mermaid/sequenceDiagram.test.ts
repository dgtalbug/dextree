import type { WorkspaceSubgraph } from "@dextree/core";
import { describe, expect, it } from "vitest";

import type { ScopedMermaidOptions } from "./scopedSerializer.js";
import {
  serializeToSequenceDiagram,
  validateSequenceDiagramExport,
  type SequenceDiagramValidation,
  type TraceSequenceSnapshot,
} from "./sequenceDiagram.js";

function makeSubgraph(
  nodes: WorkspaceSubgraph["nodes"],
  edges: WorkspaceSubgraph["edges"],
): WorkspaceSubgraph {
  return { nodes, edges, frameworks: [] };
}

function makeTrace(overrides: Partial<TraceSequenceSnapshot> = {}): TraceSequenceSnapshot {
  return {
    phase: "path-active",
    startNodeId: "n1",
    endNodeId: "n2",
    nodeIds: ["n1", "n2"],
    edgeIds: ["e1"],
    ...overrides,
  };
}

const SEQUENCE_OPTIONS: ScopedMermaidOptions = {
  diagram: "sequenceDiagram",
  scope: { kind: "workspace" },
  granularity: "symbol",
  direction: "auto",
  theme: "Light",
};

// ---------------------------------------------------------------------------
// Slice 031 Phase 1 scaffold
// ---------------------------------------------------------------------------
// This file exists so subsequent phases can land RED tests for US1 (trace
// sequence export) without restructuring imports. Real coverage for the
// validator + serializer behavior lands in T008 (US1 RED tests).
// ---------------------------------------------------------------------------

describe("sequenceDiagram module surface (slice 031 Phase 1)", () => {
  it("exports validateSequenceDiagramExport as a callable function", () => {
    expect(typeof validateSequenceDiagramExport).toBe("function");
  });

  it("exports serializeToSequenceDiagram as a callable function", () => {
    expect(typeof serializeToSequenceDiagram).toBe("function");
  });

  it("TraceSequenceSnapshot type is exported and assignable", () => {
    const snapshot: TraceSequenceSnapshot = {
      phase: "path-active",
      startNodeId: "n1",
      endNodeId: "n2",
      nodeIds: ["n1", "n2"],
      edgeIds: ["e1"],
    };
    expect(snapshot.phase).toBe("path-active");
  });

  it("SequenceDiagramValidation discriminated union accepts each documented status", () => {
    const cases: SequenceDiagramValidation[] = [
      { status: "ok", participantCount: 2, stepCount: 1 },
      { status: "empty", reason: "no nodes" },
      { status: "unsupported", reason: "no active trace" },
      {
        status: "oversized",
        participantCount: 99,
        stepCount: 999,
        cap: { participants: 40, steps: 100 },
        reason: "exceeds caps",
      },
    ];
    expect(cases).toHaveLength(4);
  });
});

describe("validateSequenceDiagramExport behavior (slice 031 T008)", () => {
  it("returns ok for a representative active trace under the caps", () => {
    const subgraph = makeSubgraph(
      [
        { id: "n1", type: "symbol", label: "foo", filePath: "/x.ts", startLine: 1 },
        { id: "n2", type: "symbol", label: "bar", filePath: "/x.ts", startLine: 2 },
      ],
      [{ id: "e1", source: "n1", target: "n2", kind: "CALLS" }],
    );
    const result = validateSequenceDiagramExport(subgraph, makeTrace());
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.participantCount).toBe(2);
      expect(result.stepCount).toBe(1);
    }
  });

  it("returns empty for a trace with zero nodes", () => {
    const subgraph = makeSubgraph([], []);
    const result = validateSequenceDiagramExport(subgraph, makeTrace({ nodeIds: [], edgeIds: [] }));
    expect(result.status).toBe("empty");
  });

  it("returns unsupported when phase is not path-active", () => {
    const subgraph = makeSubgraph([], []);
    const broken = { ...makeTrace(), phase: "idle" } as unknown as TraceSequenceSnapshot;
    const result = validateSequenceDiagramExport(subgraph, broken);
    expect(result.status).toBe("unsupported");
  });

  it("returns oversized when participant cap (40) is exceeded", () => {
    const nodeIds: string[] = [];
    for (let i = 0; i < 50; i++) nodeIds.push(`n${i}`);
    const subgraph = makeSubgraph(
      nodeIds.map((id) => ({ id, type: "symbol", label: id, filePath: "/x.ts", startLine: 1 })),
      [],
    );
    const result = validateSequenceDiagramExport(
      subgraph,
      makeTrace({ nodeIds, edgeIds: [], startNodeId: "n0", endNodeId: "n49" }),
    );
    expect(result.status).toBe("oversized");
    if (result.status === "oversized") {
      expect(result.cap.participants).toBe(40);
      expect(result.reason).toMatch(/40 participants/);
    }
  });

  it("returns oversized when step cap (100) is exceeded", () => {
    const edgeIds: string[] = [];
    for (let i = 0; i < 110; i++) edgeIds.push(`e${i}`);
    const subgraph = makeSubgraph(
      [
        { id: "n1", type: "symbol", label: "a", filePath: "/x.ts", startLine: 1 },
        { id: "n2", type: "symbol", label: "b", filePath: "/x.ts", startLine: 2 },
      ],
      [],
    );
    const result = validateSequenceDiagramExport(subgraph, makeTrace({ edgeIds }));
    expect(result.status).toBe("oversized");
    if (result.status === "oversized") {
      expect(result.cap.steps).toBe(100);
    }
  });
});

describe("serializeToSequenceDiagram behavior (slice 031 T008)", () => {
  it("emits the theme directive on the first line and sequenceDiagram on the second", () => {
    const subgraph = makeSubgraph(
      [
        { id: "n1", type: "symbol", label: "foo", filePath: "/x.ts", startLine: 1 },
        { id: "n2", type: "symbol", label: "bar", filePath: "/x.ts", startLine: 2 },
      ],
      [{ id: "e1", source: "n1", target: "n2", kind: "CALLS" }],
    );
    const out = serializeToSequenceDiagram(subgraph, makeTrace(), {
      ...SEQUENCE_OPTIONS,
      trace: makeTrace(),
    });
    const lines = out.split("\n");
    expect(lines[0]).toContain("init");
    expect(lines[1]).toBe("sequenceDiagram");
  });

  it("renders an ordered step with the source node's label", () => {
    const subgraph = makeSubgraph(
      [
        { id: "n1", type: "symbol", label: "doThing", filePath: "/x.ts", startLine: 1 },
        { id: "n2", type: "symbol", label: "helper", filePath: "/x.ts", startLine: 2 },
      ],
      [{ id: "e1", source: "n1", target: "n2", kind: "CALLS" }],
    );
    const out = serializeToSequenceDiagram(subgraph, makeTrace(), SEQUENCE_OPTIONS);
    expect(out).toMatch(/->>\+/);
    expect(out).toContain("doThing");
  });

  it("groups methods under their enclosing class participant when enclosingSymbolId is set", () => {
    const subgraph = makeSubgraph(
      [
        {
          id: "class-foo",
          type: "symbol",
          label: "Foo",
          symbolKind: "class",
          filePath: "/x.ts",
          startLine: 1,
        },
        {
          id: "method-bar",
          type: "symbol",
          label: "bar",
          symbolKind: "method",
          filePath: "/x.ts",
          startLine: 5,
          enclosingSymbolId: "class-foo",
        },
        {
          id: "method-baz",
          type: "symbol",
          label: "baz",
          symbolKind: "method",
          filePath: "/x.ts",
          startLine: 10,
          enclosingSymbolId: "class-foo",
        },
      ],
      [{ id: "e1", source: "method-bar", target: "method-baz", kind: "CALLS" }],
    );
    const trace = makeTrace({
      startNodeId: "method-bar",
      endNodeId: "method-baz",
      nodeIds: ["method-bar", "method-baz"],
      edgeIds: ["e1"],
    });
    const out = serializeToSequenceDiagram(subgraph, trace, SEQUENCE_OPTIONS);
    // Both methods should resolve to the same `class-foo` participant.
    expect(out).toContain("participant class_foo as Foo");
    // No separate participant lines for the individual methods.
    expect(out).not.toContain("participant method_bar");
  });

  it("escapes backslashes before quotes in participant and step labels (CodeQL string-escape fix)", () => {
    const trickyLabel = 'path\\to\\thing"with"quotes';
    const subgraph = makeSubgraph(
      [
        { id: "n1", type: "symbol", label: trickyLabel, filePath: "/x.ts", startLine: 1 },
        { id: "n2", type: "symbol", label: "ok", filePath: "/x.ts", startLine: 2 },
      ],
      [{ id: "e1", source: "n1", target: "n2", kind: "CALLS" }],
    );
    const out = serializeToSequenceDiagram(subgraph, makeTrace(), SEQUENCE_OPTIONS);
    // Backslash is doubled, then the inner quote is escaped — order matters,
    // otherwise the quote-escape pass double-escapes the backslashes.
    expect(out).toContain('path\\\\to\\\\thing\\"with\\"quotes');
    // No bare backslash followed by a literal quote should remain unescaped
    // (would mean the quote-replace ran before the backslash-replace).
    expect(out).not.toMatch(/[^\\]\\(?=[a-zA-Z])/);
  });

  it("strips newlines from labels so they never break the line-terminated Mermaid grammar", () => {
    const subgraph = makeSubgraph(
      [
        {
          id: "n1",
          type: "symbol",
          label: "first line\nsecond line",
          filePath: "/x.ts",
          startLine: 1,
        },
        { id: "n2", type: "symbol", label: "ok", filePath: "/x.ts", startLine: 2 },
      ],
      [{ id: "e1", source: "n1", target: "n2", kind: "CALLS" }],
    );
    const out = serializeToSequenceDiagram(subgraph, makeTrace(), SEQUENCE_OPTIONS);
    expect(out).toContain("first line second line");
    expect(out).not.toMatch(/first line\nsecond line/);
  });

  it("dedupes participants when a cyclic trace revisits the same non-class node (CodeRabbit follow-up)", () => {
    // Trace: a -> b -> a -> b -> a. Three visits to node "a", two to "b".
    // Pre-fix this would have emitted 5 participants and miscount the cap.
    const subgraph = makeSubgraph(
      [
        { id: "a", type: "symbol", label: "a", filePath: "/x.ts", startLine: 1 },
        { id: "b", type: "symbol", label: "b", filePath: "/x.ts", startLine: 2 },
      ],
      [
        { id: "e1", source: "a", target: "b", kind: "CALLS" },
        { id: "e2", source: "b", target: "a", kind: "CALLS" },
        { id: "e3", source: "a", target: "b", kind: "CALLS" },
        { id: "e4", source: "b", target: "a", kind: "CALLS" },
      ],
    );
    const trace: TraceSequenceSnapshot = {
      phase: "path-active",
      startNodeId: "a",
      endNodeId: "a",
      nodeIds: ["a", "b", "a", "b", "a"],
      edgeIds: ["e1", "e2", "e3", "e4"],
    };
    const validation = validateSequenceDiagramExport(subgraph, trace);
    expect(validation.status).toBe("ok");
    if (validation.status === "ok") {
      expect(validation.participantCount).toBe(2);
    }
    const out = serializeToSequenceDiagram(subgraph, trace, SEQUENCE_OPTIONS);
    // Exactly one `participant` line per unique node, even with cyclic revisits.
    expect(out.match(/^\s*participant\s+a\s/gm) ?? []).toHaveLength(1);
    expect(out.match(/^\s*participant\s+b\s/gm) ?? []).toHaveLength(1);
  });

  it("produces deterministic output for the same (subgraph, trace, options) tuple", () => {
    const subgraph = makeSubgraph(
      [
        { id: "n1", type: "symbol", label: "a", filePath: "/x.ts", startLine: 1 },
        { id: "n2", type: "symbol", label: "b", filePath: "/x.ts", startLine: 2 },
      ],
      [{ id: "e1", source: "n1", target: "n2", kind: "CALLS" }],
    );
    const trace = makeTrace();
    const first = serializeToSequenceDiagram(subgraph, trace, SEQUENCE_OPTIONS);
    const second = serializeToSequenceDiagram(subgraph, trace, SEQUENCE_OPTIONS);
    expect(first).toBe(second);
  });
});

describe("SequenceDiagramValidation discriminator (slice 031 Phase 1, type-only)", () => {
  it("accepts each documented status shape", () => {
    const cases: SequenceDiagramValidation[] = [
      { status: "ok", participantCount: 2, stepCount: 1 },
      { status: "empty", reason: "no nodes" },
      { status: "unsupported", reason: "no active trace" },
      {
        status: "oversized",
        participantCount: 99,
        stepCount: 999,
        cap: { participants: 40, steps: 100 },
        reason: "exceeds caps",
      },
    ];
    expect(cases).toHaveLength(4);
  });
});
