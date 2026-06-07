import type { GraphNode, WorkspaceSubgraph } from "@dextree/core";

import type { ScopedMermaidOptions } from "./scopedSerializer.js";
import { MERMAID_INIT_DIRECTIVE } from "./theme.js";
import { firstCapBreach } from "./validator.js";

export interface ClassDiagramEntry {
  classId: string;
  className: string;
  symbolKind: "class" | "interface" | "enum";
  methods: ReadonlyArray<{ id: string; name: string }>;
  inheritsFrom: ReadonlyArray<string>;
  instantiates: ReadonlyArray<string>;
  implementsInterfaces: ReadonlyArray<string>;
}

export type ClassDiagramValidation =
  | { status: "ok"; classCount: number; methodCount: number }
  | { status: "empty"; reason: string }
  | { status: "unsupported"; reason: string }
  | {
      status: "oversized";
      classCount: number;
      methodCount: number;
      cap: { classes: number; methods: number };
      reason: string;
    };

export const MERMAID_CLASS_DIAGRAM_CAPS = {
  classes: 80,
  methods: 200,
} as const;

type ClassLikeKind = "class" | "interface" | "enum";
const CLASS_LIKE_KINDS: ReadonlySet<string> = new Set(["class", "interface", "enum"]);

function isClassLike(node: GraphNode): node is GraphNode & { symbolKind: ClassLikeKind } {
  return (
    node.type === "symbol" && node.symbolKind !== undefined && CLASS_LIKE_KINDS.has(node.symbolKind)
  );
}

export function groupClassDiagramEntries(
  subgraph: WorkspaceSubgraph,
): ReadonlyArray<ClassDiagramEntry> {
  const classNodes: Array<GraphNode & { symbolKind: ClassLikeKind }> = [];
  const classNodeIds = new Set<string>();
  const symbolNodes: GraphNode[] = [];

  for (const node of subgraph.nodes) {
    if (node.type !== "symbol") continue;
    symbolNodes.push(node);
    if (isClassLike(node)) {
      classNodes.push(node);
      classNodeIds.add(node.id);
    }
  }

  if (classNodes.length === 0) return [];

  const methodsByParent = new Map<string, Array<{ id: string; name: string }>>();
  for (const node of symbolNodes) {
    const parentId = node.enclosingSymbolId;
    if (parentId === undefined) continue;
    if (!classNodeIds.has(parentId)) continue;
    if (node.id === parentId) continue;
    let bucket = methodsByParent.get(parentId);
    if (bucket === undefined) {
      bucket = [];
      methodsByParent.set(parentId, bucket);
    }
    bucket.push({ id: node.id, name: node.label });
  }
  for (const bucket of methodsByParent.values()) {
    bucket.sort((a, b) => a.name.localeCompare(b.name));
  }

  const inheritsByClass = new Map<string, string[]>();
  const instantiatesByClass = new Map<string, string[]>();
  const implementsByClass = new Map<string, string[]>();
  for (const edge of subgraph.edges) {
    if (!classNodeIds.has(edge.source) || !classNodeIds.has(edge.target)) continue;
    if (edge.kind === "INHERITS") {
      let bucket = inheritsByClass.get(edge.source);
      if (bucket === undefined) {
        bucket = [];
        inheritsByClass.set(edge.source, bucket);
      }
      bucket.push(edge.target);
    } else if (edge.kind === "INSTANTIATES") {
      let bucket = instantiatesByClass.get(edge.source);
      if (bucket === undefined) {
        bucket = [];
        instantiatesByClass.set(edge.source, bucket);
      }
      bucket.push(edge.target);
    } else if (edge.kind === "IMPLEMENTS") {
      let bucket = implementsByClass.get(edge.source);
      if (bucket === undefined) {
        bucket = [];
        implementsByClass.set(edge.source, bucket);
      }
      bucket.push(edge.target);
    }
  }
  for (const bucket of inheritsByClass.values()) bucket.sort((a, b) => a.localeCompare(b));
  for (const bucket of instantiatesByClass.values()) bucket.sort((a, b) => a.localeCompare(b));
  for (const bucket of implementsByClass.values()) bucket.sort((a, b) => a.localeCompare(b));

  return classNodes
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((classNode) => ({
      classId: classNode.id,
      className: classNode.label,
      symbolKind: classNode.symbolKind,
      methods: methodsByParent.get(classNode.id) ?? [],
      inheritsFrom: inheritsByClass.get(classNode.id) ?? [],
      instantiates: instantiatesByClass.get(classNode.id) ?? [],
      implementsInterfaces: implementsByClass.get(classNode.id) ?? [],
    }));
}

export function validateClassDiagramExport(subgraph: WorkspaceSubgraph): ClassDiagramValidation {
  if (subgraph.nodes.length === 0) {
    return { status: "empty", reason: "Scope resolved to zero nodes; pick a wider scope." };
  }

  const entries = groupClassDiagramEntries(subgraph);
  if (entries.length === 0) {
    return {
      status: "unsupported",
      reason: "No class, interface, or enum symbols are in the chosen scope.",
    };
  }

  const classCount = entries.length;
  const methodCount = entries.reduce((sum, e) => sum + e.methods.length, 0);

  const breach = firstCapBreach([
    {
      count: classCount,
      cap: MERMAID_CLASS_DIAGRAM_CAPS.classes,
      reason: (count, cap) =>
        `${count} classes exceeds the class-diagram cap of ${cap}; narrow the scope.`,
    },
    {
      count: methodCount,
      cap: MERMAID_CLASS_DIAGRAM_CAPS.methods,
      reason: (count, cap) =>
        `${count} method stubs exceeds the class-diagram cap of ${cap}; narrow the scope.`,
    },
  ]);
  if (breach !== null) {
    return {
      status: "oversized",
      classCount,
      methodCount,
      cap: MERMAID_CLASS_DIAGRAM_CAPS,
      reason: breach,
    };
  }

  return { status: "ok", classCount, methodCount };
}

// Mermaid classDiagram class identifiers must start with a letter or underscore
// and contain only alphanumerics or underscores. Source-code class names that
// satisfy this pass through unchanged; the rest are sanitized. Same-name
// classes across different scopes would collide here — known v1 limitation;
// real workspaces typically resolve same-name classes by namespace.
function toMermaidClassName(label: string): string {
  const safe = label.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(safe) ? safe : "_" + safe;
}

/** Emit the `class Foo { +bar() }` blocks (one per entry, methods inline). */
function emitClassBodies(
  entries: ReadonlyArray<ClassDiagramEntry>,
  classNameById: ReadonlyMap<string, string>,
): string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    const safeName = classNameById.get(entry.classId)!;
    if (entry.methods.length === 0) {
      lines.push(`  class ${safeName}`);
    } else {
      lines.push(`  class ${safeName} {`);
      for (const method of entry.methods) {
        lines.push(`    +${method.name}()`);
      }
      lines.push(`  }`);
    }
  }
  return lines;
}

/**
 * Collect inheritance / instantiation / implementation relationship lines,
 * sorted deterministically by (source, target) so the diagram is stable across
 * runs. Edges to targets outside the current scope are skipped.
 */
function collectRelationshipLines(
  entries: ReadonlyArray<ClassDiagramEntry>,
  classNameById: ReadonlyMap<string, string>,
): string[] {
  type RelationshipLine = { source: string; target: string; line: string };
  const relationships: RelationshipLine[] = [];
  const push = (
    entry: ClassDiagramEntry,
    targetId: string,
    render: (s: string, t: string) => string,
  ) => {
    const sourceName = classNameById.get(entry.classId)!;
    const targetName = classNameById.get(targetId);
    if (targetName === undefined) return;
    relationships.push({
      source: entry.classId,
      target: targetId,
      line: render(sourceName, targetName),
    });
  };

  for (const entry of entries) {
    for (const targetId of entry.inheritsFrom) {
      push(entry, targetId, (s, t) => `  ${s} <|-- ${t}`);
    }
    for (const targetId of entry.instantiates) {
      push(entry, targetId, (s, t) => `  ${s} <.. ${t}`);
    }
    for (const targetId of entry.implementsInterfaces) {
      push(entry, targetId, (s, t) => `  ${t} <|.. ${s}`);
    }
  }

  relationships.sort((a, b) =>
    `${a.source}\0${a.target}`.localeCompare(`${b.source}\0${b.target}`),
  );
  return relationships.map((rel) => rel.line);
}

export function serializeToClassDiagram(
  subgraph: WorkspaceSubgraph,
  options: ScopedMermaidOptions,
): string {
  const validation = validateClassDiagramExport(subgraph);
  if (validation.status !== "ok") {
    throw new Error(validation.reason);
  }

  const entries = groupClassDiagramEntries(subgraph);
  const classNameById = new Map<string, string>();
  for (const entry of entries) {
    classNameById.set(entry.classId, toMermaidClassName(entry.className));
  }

  return [
    MERMAID_INIT_DIRECTIVE[options.theme],
    "classDiagram",
    ...emitClassBodies(entries, classNameById),
    ...collectRelationshipLines(entries, classNameById),
  ].join("\n");
}
