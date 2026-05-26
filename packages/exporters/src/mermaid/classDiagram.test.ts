import type { GraphEdge, GraphNode, WorkspaceSubgraph } from "@dextree/core";
import { describe, expect, it } from "vitest";

import {
  groupClassDiagramEntries,
  MERMAID_CLASS_DIAGRAM_CAPS,
  serializeToClassDiagram,
  validateClassDiagramExport,
} from "./classDiagram.js";
import type { ScopedMermaidOptions } from "./scopedSerializer.js";

function classNode(
  id: string,
  label: string,
  kind: "class" | "interface" | "enum" = "class",
): GraphNode {
  return {
    id,
    type: "symbol",
    label,
    filePath: "/workspace/src/a.ts",
    startLine: 1,
    symbolKind: kind,
  };
}

function memberNode(
  id: string,
  label: string,
  parentId: string,
  kind: GraphNode["symbolKind"] = "method",
): GraphNode {
  return {
    id,
    type: "symbol",
    label,
    filePath: "/workspace/src/a.ts",
    startLine: 5,
    symbolKind: kind,
    enclosingSymbolId: parentId,
  };
}

function topLevelNode(id: string, label: string): GraphNode {
  return {
    id,
    type: "symbol",
    label,
    filePath: "/workspace/src/a.ts",
    startLine: 1,
    symbolKind: "function",
  };
}

function fileNode(id: string, label: string): GraphNode {
  return {
    id,
    type: "file",
    label,
    filePath: `/workspace/${label}`,
    startLine: 0,
  };
}

function edge(id: string, source: string, target: string, kind: GraphEdge["kind"]): GraphEdge {
  return { id, source, target, kind };
}

function subgraph(nodes: GraphNode[], edges: GraphEdge[] = []): WorkspaceSubgraph {
  return { nodes, edges, frameworks: [] };
}

const DEFAULT_OPTIONS: ScopedMermaidOptions = {
  diagram: "classDiagram",
  scope: { kind: "workspace" },
  granularity: "symbol",
  direction: "auto",
  theme: "Light",
};

// ---------------------------------------------------------------------------
// T011 — groupClassDiagramEntries
// ---------------------------------------------------------------------------

describe("groupClassDiagramEntries — class-like detection", () => {
  it("returns entries for class, interface, and enum symbols", () => {
    const A = classNode("class-a", "Animal", "class");
    const B = classNode("iface-b", "Walker", "interface");
    const C = classNode("enum-c", "Status", "enum");
    const entries = groupClassDiagramEntries(subgraph([A, B, C]));
    expect(entries.map((e) => e.classId).sort()).toEqual(["class-a", "enum-c", "iface-b"]);
    expect(entries.find((e) => e.classId === "class-a")?.symbolKind).toBe("class");
    expect(entries.find((e) => e.classId === "iface-b")?.symbolKind).toBe("interface");
    expect(entries.find((e) => e.classId === "enum-c")?.symbolKind).toBe("enum");
  });

  it("ignores non-class-like symbols and file nodes", () => {
    const A = classNode("class-a", "Animal");
    const fn = topLevelNode("fn-1", "doStuff");
    const file = fileNode("file-1", "src/a.ts");
    const entries = groupClassDiagramEntries(subgraph([A, fn, file]));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.classId).toBe("class-a");
  });

  it("returns an empty array when no class-like symbols are present", () => {
    const fn = topLevelNode("fn-1", "doStuff");
    const file = fileNode("file-1", "src/a.ts");
    expect(groupClassDiagramEntries(subgraph([fn, file]))).toEqual([]);
  });

  it("returns entries sorted by class id", () => {
    const A = classNode("zzz-class", "Zeta");
    const B = classNode("aaa-class", "Alpha");
    const entries = groupClassDiagramEntries(subgraph([A, B]));
    expect(entries.map((e) => e.classId)).toEqual(["aaa-class", "zzz-class"]);
  });
});

describe("groupClassDiagramEntries — method grouping via enclosingSymbolId", () => {
  it("groups members under their enclosing class only when parent is in scope", () => {
    const A = classNode("class-a", "Animal");
    const m1 = memberNode("m-1", "eat", "class-a");
    const m2 = memberNode("m-2", "sleep", "class-a");
    const entries = groupClassDiagramEntries(subgraph([A, m1, m2]));
    const animal = entries.find((e) => e.classId === "class-a");
    expect(animal?.methods.map((m) => m.name)).toEqual(["eat", "sleep"]);
  });

  it("skips members whose enclosing parent is out of scope", () => {
    const A = classNode("class-a", "Animal");
    const orphan = memberNode("m-orphan", "ghost", "class-missing");
    const entries = groupClassDiagramEntries(subgraph([A, orphan]));
    expect(entries[0]?.methods).toEqual([]);
  });

  it("sorts methods inside a class by name", () => {
    const A = classNode("class-a", "Animal");
    const m1 = memberNode("m-1", "zeta", "class-a");
    const m2 = memberNode("m-2", "alpha", "class-a");
    const m3 = memberNode("m-3", "mu", "class-a");
    const entries = groupClassDiagramEntries(subgraph([A, m1, m2, m3]));
    expect(entries[0]?.methods.map((m) => m.name)).toEqual(["alpha", "mu", "zeta"]);
  });

  it("does not treat top-level symbols (no enclosingSymbolId) as members of any class", () => {
    const A = classNode("class-a", "Animal");
    const top = topLevelNode("fn-1", "freeFunction");
    const entries = groupClassDiagramEntries(subgraph([A, top]));
    expect(entries[0]?.methods).toEqual([]);
  });
});

describe("groupClassDiagramEntries — inheritsFrom / instantiates in-scope filter", () => {
  it("includes inheritsFrom only when both endpoints are class-like and in scope", () => {
    const Animal = classNode("class-animal", "Animal");
    const Dog = classNode("class-dog", "Dog");
    const e1 = edge("e-inh", "class-dog", "class-animal", "INHERITS");
    const entries = groupClassDiagramEntries(subgraph([Animal, Dog], [e1]));
    expect(entries.find((e) => e.classId === "class-dog")?.inheritsFrom).toEqual(["class-animal"]);
    expect(entries.find((e) => e.classId === "class-animal")?.inheritsFrom).toEqual([]);
  });

  it("drops INHERITS edges when the parent class is out of scope", () => {
    const Dog = classNode("class-dog", "Dog");
    const e1 = edge("e-inh", "class-dog", "class-animal-missing", "INHERITS");
    const entries = groupClassDiagramEntries(subgraph([Dog], [e1]));
    expect(entries[0]?.inheritsFrom).toEqual([]);
  });

  it("includes instantiates only when both endpoints are class-like and in scope", () => {
    const Factory = classNode("class-fac", "Factory");
    const Widget = classNode("class-wid", "Widget");
    const e1 = edge("e-inst", "class-fac", "class-wid", "INSTANTIATES");
    const entries = groupClassDiagramEntries(subgraph([Factory, Widget], [e1]));
    expect(entries.find((e) => e.classId === "class-fac")?.instantiates).toEqual(["class-wid"]);
  });

  it("sorts inheritsFrom and instantiates by target id within each class", () => {
    const Child = classNode("class-child", "Child");
    const P1 = classNode("class-zzz", "Zeta");
    const P2 = classNode("class-aaa", "Alpha");
    const e1 = edge("e1", "class-child", "class-zzz", "INHERITS");
    const e2 = edge("e2", "class-child", "class-aaa", "INHERITS");
    const entries = groupClassDiagramEntries(subgraph([Child, P1, P2], [e1, e2]));
    expect(entries.find((e) => e.classId === "class-child")?.inheritsFrom).toEqual([
      "class-aaa",
      "class-zzz",
    ]);
  });
});

// ---------------------------------------------------------------------------
// T012 — validateClassDiagramExport decision table
// ---------------------------------------------------------------------------

describe("validateClassDiagramExport", () => {
  it("returns empty when the subgraph has zero nodes", () => {
    const result = validateClassDiagramExport(subgraph([]));
    expect(result.status).toBe("empty");
    if (result.status === "empty") {
      expect(result.reason).toMatch(/zero nodes/);
    }
  });

  it("returns unsupported when no class-like symbols are present", () => {
    const fn = topLevelNode("fn-1", "doStuff");
    const file = fileNode("file-1", "src/a.ts");
    const result = validateClassDiagramExport(subgraph([fn, file]));
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reason).toBe("No class, interface, or enum symbols are in the chosen scope.");
    }
  });

  it("returns oversized when classCount exceeds the cap and reason quotes the cap", () => {
    const tooMany: GraphNode[] = [];
    for (let i = 0; i < MERMAID_CLASS_DIAGRAM_CAPS.classes + 1; i++) {
      tooMany.push(classNode(`c-${i.toString().padStart(4, "0")}`, `Cls${i}`));
    }
    const result = validateClassDiagramExport(subgraph(tooMany));
    expect(result.status).toBe("oversized");
    if (result.status === "oversized") {
      expect(result.classCount).toBe(MERMAID_CLASS_DIAGRAM_CAPS.classes + 1);
      expect(result.reason).toContain(String(MERMAID_CLASS_DIAGRAM_CAPS.classes));
    }
  });

  it("returns oversized when methodCount exceeds the cap and reason quotes the cap", () => {
    const A = classNode("class-a", "Animal");
    const methods: GraphNode[] = [];
    for (let i = 0; i < MERMAID_CLASS_DIAGRAM_CAPS.methods + 1; i++) {
      methods.push(memberNode(`m-${i.toString().padStart(4, "0")}`, `method${i}`, "class-a"));
    }
    const result = validateClassDiagramExport(subgraph([A, ...methods]));
    expect(result.status).toBe("oversized");
    if (result.status === "oversized") {
      expect(result.methodCount).toBe(MERMAID_CLASS_DIAGRAM_CAPS.methods + 1);
      expect(result.reason).toContain(String(MERMAID_CLASS_DIAGRAM_CAPS.methods));
    }
  });

  it("returns ok for a within-cap class-bearing subgraph", () => {
    const A = classNode("class-a", "Animal");
    const m = memberNode("m-1", "eat", "class-a");
    const result = validateClassDiagramExport(subgraph([A, m]));
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.classCount).toBe(1);
      expect(result.methodCount).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// T013 — serializeToClassDiagram integration
// ---------------------------------------------------------------------------

describe("serializeToClassDiagram", () => {
  it("emits the theme init directive on line 1 and 'classDiagram' on line 2", () => {
    const A = classNode("class-a", "Animal");
    const lines = serializeToClassDiagram(subgraph([A]), DEFAULT_OPTIONS).split("\n");
    expect(lines[0]).toBe("%%{init: {'theme': 'default'}}%%");
    expect(lines[1]).toBe("classDiagram");
  });

  it("emits no direction token after the classDiagram header", () => {
    const A = classNode("class-a", "Animal");
    const out = serializeToClassDiagram(subgraph([A]), DEFAULT_OPTIONS);
    // Slice-027 flowchart emits `graph TB`/`LR`/etc; classDiagram has no direction.
    expect(out).not.toMatch(/^graph\s/m);
    expect(out).not.toMatch(/classDiagram\s+(TB|LR|BT|RL)/);
  });

  it("renders a class with method stubs as +name() inside { } braces", () => {
    const A = classNode("class-a", "Animal");
    const m1 = memberNode("m-1", "eat", "class-a");
    const m2 = memberNode("m-2", "sleep", "class-a");
    const out = serializeToClassDiagram(subgraph([A, m1, m2]), DEFAULT_OPTIONS);
    expect(out).toContain("class Animal {");
    expect(out).toContain("+eat()");
    expect(out).toContain("+sleep()");
    expect(out).toContain("}");
  });

  it("renders a methodless class as a single 'class Name' line with no braces", () => {
    const A = classNode("class-a", "Animal");
    const out = serializeToClassDiagram(subgraph([A]), DEFAULT_OPTIONS);
    expect(out).toContain("class Animal");
    expect(out).not.toContain("class Animal {");
  });

  it("renders INHERITS edges as <|-- arrows between class names in scope", () => {
    const Animal = classNode("class-animal", "Animal");
    const Dog = classNode("class-dog", "Dog");
    const e1 = edge("e-inh", "class-dog", "class-animal", "INHERITS");
    const out = serializeToClassDiagram(subgraph([Animal, Dog], [e1]), DEFAULT_OPTIONS);
    expect(out).toContain("Dog <|-- Animal");
  });

  it("renders INSTANTIATES edges as <.. arrows between class names in scope", () => {
    const Factory = classNode("class-fac", "Factory");
    const Widget = classNode("class-wid", "Widget");
    const e1 = edge("e-inst", "class-fac", "class-wid", "INSTANTIATES");
    const out = serializeToClassDiagram(subgraph([Factory, Widget], [e1]), DEFAULT_OPTIONS);
    expect(out).toContain("Factory <.. Widget");
  });

  it("is deterministic — same input yields byte-identical output across two calls", () => {
    const A = classNode("class-a", "Animal");
    const B = classNode("class-b", "Dog");
    const m1 = memberNode("m-1", "eat", "class-a");
    const m2 = memberNode("m-2", "bark", "class-b");
    const e1 = edge("e-inh", "class-b", "class-a", "INHERITS");
    const sg = subgraph([A, B, m1, m2], [e1]);
    const first = serializeToClassDiagram(sg, DEFAULT_OPTIONS);
    const second = serializeToClassDiagram(sg, DEFAULT_OPTIONS);
    expect(first).toBe(second);
  });

  it("throws with the validation reason when no class-like symbols are present", () => {
    const fn = topLevelNode("fn-1", "doStuff");
    expect(() => serializeToClassDiagram(subgraph([fn]), DEFAULT_OPTIONS)).toThrow(
      /No class, interface, or enum symbols are in the chosen scope/,
    );
  });
});

// ---------------------------------------------------------------------------
// T025 — missing UML detail is omitted, not invented. The v1 preview shows
// only what pass-1 extraction provides; no fake signatures, no fake visibility,
// no fake implements arrows.
// ---------------------------------------------------------------------------

describe("serializeToClassDiagram — missing UML detail is absent, not faked (US3)", () => {
  it("never emits parameter lists or return-type annotations", () => {
    const A = classNode("class-a", "Animal");
    const m = memberNode("m-eat", "eat", "class-a");
    const out = serializeToClassDiagram(subgraph([A, m]), DEFAULT_OPTIONS);
    expect(out).toContain("+eat()");
    // No types or args:
    expect(out).not.toMatch(/\+eat\([^)]+\)/);
    expect(out).not.toMatch(/\+eat\(\)\s*:/);
  });

  it("never emits visibility prefixes other than '+'", () => {
    const A = classNode("class-a", "Animal");
    const m = memberNode("m-eat", "eat", "class-a");
    const out = serializeToClassDiagram(subgraph([A, m]), DEFAULT_OPTIONS);
    // Look only inside method-stub lines (the +/-/~ chars never appear there
    // outside the visibility prefix slot).
    const methodLines = out.split("\n").filter((l) => /^\s{4}\S/.test(l));
    for (const line of methodLines) {
      expect(line).toMatch(/^\s+\+/);
    }
  });

  it("does not emit '..|>' implements arrows even when an IMPLEMENTS-like edge is in the input", () => {
    const Iface = classNode("class-iface", "Walker", "interface");
    const Impl = classNode("class-impl", "Dog");
    // Slice 028 does not have IMPLEMENTS — feed a synthetic INHERITS edge to
    // confirm we render <|-- and never the dependency-style '..|>' arrow.
    const e1 = edge("e-imp", "class-impl", "class-iface", "INHERITS");
    const out = serializeToClassDiagram(subgraph([Iface, Impl], [e1]), DEFAULT_OPTIONS);
    expect(out).toContain("Dog <|-- Walker");
    expect(out).not.toContain("..|>");
  });

  it("never emits placeholder text like '[unknown]' or empty parens with hint syntax", () => {
    const A = classNode("class-a", "Animal");
    const out = serializeToClassDiagram(subgraph([A]), DEFAULT_OPTIONS);
    expect(out).not.toContain("[unknown]");
    expect(out).not.toContain("(...)");
    expect(out).not.toMatch(/\(\s*\?\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// T021 — end-to-end method-grouping correctness with same-named methods
// across two classes (proves grouping uses enclosingSymbolId, not name match)
// ---------------------------------------------------------------------------

describe("serializeToClassDiagram — same-named methods grouped by enclosingSymbolId (US2)", () => {
  it("renders two render() methods under the right class boxes, not collapsed into one", () => {
    const Button = classNode("class-button", "Button");
    const Card = classNode("class-card", "Card");
    const renderInButton = memberNode("m-render-btn", "render", "class-button");
    const renderInCard = memberNode("m-render-card", "render", "class-card");

    const sg = subgraph([Button, Card, renderInButton, renderInCard]);
    const out = serializeToClassDiagram(sg, DEFAULT_OPTIONS);

    expect(out).toMatch(/class Button \{[\s\S]*\+render\(\)[\s\S]*\}/);
    expect(out).toMatch(/class Card \{[\s\S]*\+render\(\)[\s\S]*\}/);
    // Confirm both methods appear (one per class); the serializer never
    // deduplicates by method name across classes.
    const renderHits = out.match(/\+render\(\)/g) ?? [];
    expect(renderHits.length).toBe(2);
  });

  it("grouping survives a method rename inside one class without leaking to the other", () => {
    const Button = classNode("class-button", "Button");
    const Card = classNode("class-card", "Card");
    const renderInButton = memberNode("m-render-btn", "renderOldStyle", "class-button"); // renamed
    const renderInCard = memberNode("m-render-card", "render", "class-card");

    const sg = subgraph([Button, Card, renderInButton, renderInCard]);
    const entries = groupClassDiagramEntries(sg);

    const buttonEntry = entries.find((e) => e.classId === "class-button");
    const cardEntry = entries.find((e) => e.classId === "class-card");

    expect(buttonEntry?.methods.map((m) => m.name)).toEqual(["renderOldStyle"]);
    expect(cardEntry?.methods.map((m) => m.name)).toEqual(["render"]);
  });
});
