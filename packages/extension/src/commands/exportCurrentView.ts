import * as vscode from "vscode";

import type { InferredMermaidExport } from "./inferredMermaidExport.js";

/**
 * Dependencies for the export-current-view command.
 */
export interface ExportCurrentViewDependencies {
  exportInferred: (inferred: InferredMermaidExport) => Promise<void>;
}

/**
 * `dextree.exportCurrentView` command body (slice 030, US3).
 *
 * Exports the current graph view as a Mermaid diagram. The webview posts the
 * current view ID; the host resolves it into an inferred export and delegates
 * to the shared export path.
 *
 * Fails closed when no current-view snapshot is available.
 */
export function createExportCurrentViewCommand(
  _dependencies: ExportCurrentViewDependencies,
): () => Promise<void> {
  return async () => {
    await vscode.window.showInformationMessage(
      "Dextree: Current-view export requires an active graph view. Open the graph and use the toolbar export button.",
    );
  };
}

/**
 * Handles an `exportCurrentView` message from the webview. Resolves the view
 * ID into an inferred export and delegates to the shared path.
 */
export async function handleExportCurrentViewMessage(
  viewId: string,
  dependencies: ExportCurrentViewDependencies,
): Promise<void> {
  void viewId;
  void dependencies;
  // Placeholder: current-view routing will be wired in later phases.
}
