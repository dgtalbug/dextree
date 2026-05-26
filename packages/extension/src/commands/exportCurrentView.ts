import * as vscode from "vscode";

import type { InferredMermaidExport } from "./inferredMermaidExport.js";

export interface ExportCurrentViewDependencies {
  exportInferred: (inferred: InferredMermaidExport) => Promise<void>;
}

export function createExportCurrentViewCommand(
  _dependencies: ExportCurrentViewDependencies,
): () => Promise<void> {
  return async () => {
    await vscode.window.showInformationMessage(
      "Dextree: Current-view export requires an active graph view. Open the graph and use the toolbar export button.",
    );
  };
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
  dependencies: ExportCurrentViewDependencies,
): Promise<void> {
  void viewId;
  void dependencies;
}
