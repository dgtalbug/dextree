import type { WorkspaceSubgraph } from "@dextree/core";

import type { ScopedMermaidOptions } from "./scopedSerializer.js";

export interface ClassDiagramEntry {
  classId: string;
  className: string;
  symbolKind: "class" | "interface" | "enum";
  methods: ReadonlyArray<{ id: string; name: string }>;
  inheritsFrom: ReadonlyArray<string>;
  instantiates: ReadonlyArray<string>;
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

export function groupClassDiagramEntries(
  _subgraph: WorkspaceSubgraph,
): ReadonlyArray<ClassDiagramEntry> {
  throw new Error("groupClassDiagramEntries not implemented yet — see slice 028 T015");
}

export function validateClassDiagramExport(_subgraph: WorkspaceSubgraph): ClassDiagramValidation {
  throw new Error("validateClassDiagramExport not implemented yet — see slice 028 T015");
}

export function serializeToClassDiagram(
  _subgraph: WorkspaceSubgraph,
  _options: ScopedMermaidOptions,
): string {
  throw new Error("serializeToClassDiagram not implemented yet — see slice 028 T015");
}
