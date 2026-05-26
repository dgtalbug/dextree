import type { MermaidDirection, MermaidScope } from "@dextree/exporters";

/**
 * Describes which focused export path the user invoked.
 */
export type MermaidExportIntent =
  | "generic-selection"
  | "callers"
  | "callees"
  | "class-hierarchy"
  | "package"
  | "trace"
  | "current-view";

/**
 * The resolved source context for an inferred Mermaid export.
 */
export type MermaidSelectionContext =
  | { kind: "symbol"; symbolId: string; filePath: string }
  | { kind: "file"; relativePath: string }
  | { kind: "folder"; relativePath: string }
  | { kind: "trace"; startSymbolId: string; endSymbolId: string }
  | { kind: "current-view"; viewId: string };

/**
 * The extension-owned export request after defaults are inferred from command
 * intent and selection context.
 */
export interface InferredMermaidExport {
  intent: MermaidExportIntent;
  context: MermaidSelectionContext;
  scope: MermaidScope;
  diagram: "flowchart" | "classDiagram";
  direction: MermaidDirection;
}

/**
 * Resolve default scope, diagram, and direction from the supplied intent and
 * context. Fails closed with `null` when the requested context cannot be
 * satisfied in this phase.
 */
export function resolveInferredMermaidExport(
  intent: MermaidExportIntent,
  context: MermaidSelectionContext,
): InferredMermaidExport | null {
  switch (intent) {
    case "generic-selection":
      return resolveGenericSelection(context);
    case "callers":
      return resolveCallers(context);
    case "callees":
      return resolveCallees(context);
    case "class-hierarchy":
      return resolveClassHierarchy(context);
    case "package":
      return resolvePackage(context);
    case "trace":
      return resolveTrace(context);
    case "current-view":
      return resolveCurrentView(context);
    default:
      return null;
  }
}

function resolveGenericSelection(context: MermaidSelectionContext): InferredMermaidExport | null {
  switch (context.kind) {
    case "symbol":
      return {
        intent: "generic-selection",
        context,
        scope: { kind: "symbol-callers", symbolId: context.symbolId },
        diagram: "flowchart",
        direction: "LR",
      };
    case "file":
      return {
        intent: "generic-selection",
        context,
        scope: { kind: "file", relativePath: context.relativePath },
        diagram: "flowchart",
        direction: "TB",
      };
    case "folder":
      return {
        intent: "generic-selection",
        context,
        scope: { kind: "workspace" },
        diagram: "flowchart",
        direction: "TB",
      };
    default:
      return null;
  }
}

function resolveCallers(context: MermaidSelectionContext): InferredMermaidExport | null {
  if (context.kind !== "symbol") return null;
  return {
    intent: "callers",
    context,
    scope: { kind: "symbol-callers", symbolId: context.symbolId },
    diagram: "flowchart",
    direction: "LR",
  };
}

function resolveCallees(context: MermaidSelectionContext): InferredMermaidExport | null {
  if (context.kind !== "symbol") return null;
  return {
    intent: "callees",
    context,
    scope: { kind: "symbol-callees", symbolId: context.symbolId },
    diagram: "flowchart",
    direction: "LR",
  };
}

function resolveClassHierarchy(context: MermaidSelectionContext): InferredMermaidExport | null {
  if (context.kind !== "symbol") return null;
  return {
    intent: "class-hierarchy",
    context,
    scope: { kind: "symbol-callers", symbolId: context.symbolId },
    diagram: "classDiagram",
    direction: "TB",
  };
}

function resolvePackage(context: MermaidSelectionContext): InferredMermaidExport | null {
  if (context.kind === "folder") {
    return {
      intent: "package",
      context,
      scope: { kind: "workspace" },
      diagram: "flowchart",
      direction: "TB",
    };
  }
  if (context.kind === "file") {
    return {
      intent: "package",
      context,
      scope: { kind: "file", relativePath: context.relativePath },
      diagram: "flowchart",
      direction: "TB",
    };
  }
  return null;
}

function resolveTrace(context: MermaidSelectionContext): InferredMermaidExport | null {
  if (context.kind !== "trace") return null;
  return {
    intent: "trace",
    context,
    scope: { kind: "workspace" },
    diagram: "flowchart",
    direction: "TB",
  };
}

function resolveCurrentView(context: MermaidSelectionContext): InferredMermaidExport | null {
  if (context.kind !== "current-view") return null;
  return {
    intent: "current-view",
    context,
    scope: { kind: "workspace" },
    diagram: "flowchart",
    direction: "TB",
  };
}
