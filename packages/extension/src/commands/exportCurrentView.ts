import * as vscode from "vscode";

import type { InferredMermaidExport } from "./inferredMermaidExport.js";

export interface ExportCurrentViewDependencies {
  exportInferred: (inferred: InferredMermaidExport) => Promise<void>;
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
  await dependencies.exportInferred({
    intent: "current-view",
    context: { kind: "current-view", viewId },
    scope: { kind: "visible", nodeIds, edgeIds },
    diagram: "flowchart",
    direction: "auto",
  });
}
