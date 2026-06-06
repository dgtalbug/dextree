import * as vscode from "vscode";

import type { InferredMermaidExport } from "./inferredMermaidExport.js";

export interface ExportCurrentViewDependencies {
  exportInferred: (inferred: InferredMermaidExport) => Promise<void>;
  /** Override the scope picker (defaults to a VS Code QuickPick). For tests. */
  pickScope?: (nodeCount: number) => Promise<"visible" | "workspace" | "cancel">;
}

export function createExportCurrentViewCommand(
  dependencies: ExportCurrentViewDependencies,
): (...args: unknown[]) => Promise<void> {
  return async (...args: unknown[]) => {
    const viewId = args[0];
    if (typeof viewId === "string" && viewId.length > 0) {
      const nodeIds = toStringArray(args[1]);
      const edgeIds = toStringArray(args[2]);
      await handleExportCurrentViewMessage(viewId, nodeIds, edgeIds, dependencies);
      return;
    }
    await vscode.window.showInformationMessage(
      "Dextree: Current-view export requires an active graph view. Open the graph and use the toolbar export button.",
    );
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function createExportTraceCommand(
  _dependencies: ExportCurrentViewDependencies,
): () => Promise<void> {
  return async () => {
    await vscode.window.showInformationMessage(
      "Dextree: Trace export requires an active trace route. Run a trace first, then export the result.",
    );
  };
}

export async function handleExportCurrentViewMessage(
  viewId: string,
  nodeIds: string[],
  edgeIds: string[],
  dependencies: ExportCurrentViewDependencies,
): Promise<void> {
  // Ask which scope to export. When the current view has members, offer it as
  // the default ("current view (N)"); always offer the whole workspace. With no
  // rendered members, skip the picker and export the whole workspace.
  const scope = await pickExportScope(nodeIds, edgeIds, dependencies);
  if (scope === null) {
    return; // user dismissed the picker
  }
  await dependencies.exportInferred({
    intent: "current-view",
    context: { kind: "current-view", viewId },
    scope,
    diagram: "flowchart",
    direction: "auto",
  });
}

type ExportScope =
  | { kind: "visible"; nodeIds: string[]; edgeIds: string[] }
  | { kind: "workspace" };

/**
 * Resolve the export scope via a QuickPick. Returns null when the user dismisses
 * the picker (export should be cancelled). Falls straight through to whole-
 * workspace when the current view is empty (nothing to scope to).
 */
async function pickExportScope(
  nodeIds: string[],
  edgeIds: string[],
  dependencies: ExportCurrentViewDependencies,
): Promise<ExportScope | null> {
  if (nodeIds.length === 0) {
    return { kind: "workspace" };
  }

  // Injectable in tests; defaults to the VS Code QuickPick.
  const ask = dependencies.pickScope ?? defaultPickScope;
  const choice = await ask(nodeIds.length);
  if (choice === "cancel") {
    return null;
  }
  return choice === "visible" ? { kind: "visible", nodeIds, edgeIds } : { kind: "workspace" };
}

async function defaultPickScope(nodeCount: number): Promise<"visible" | "workspace" | "cancel"> {
  const currentView = `Current view (${nodeCount} ${nodeCount === 1 ? "node" : "nodes"})`;
  const wholeWorkspace = "Whole workspace";
  const picked = await vscode.window.showQuickPick([currentView, wholeWorkspace], {
    title: "Export to Mermaid",
    placeHolder: "Choose what to export",
  });
  if (picked === undefined) {
    return "cancel";
  }
  return picked === currentView ? "visible" : "workspace";
}
