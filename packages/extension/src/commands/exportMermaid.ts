import { DEFAULT_MERMAID_THEME, isMermaidTheme, serializeToMermaid } from "@dextree/exporters";
import type { Indexer } from "@dextree/core";
import * as vscode from "vscode";

export interface ExportMermaidCommandDependencies {
  getIndexer: () => Promise<Pick<Indexer, "getWorkspaceSubgraph">>;
}

export function createExportMermaidCommand(
  dependencies: ExportMermaidCommandDependencies,
): () => Promise<void> {
  return async () => {
    const root = vscode.workspace.workspaceFolders?.[0];
    if (root === undefined) {
      await vscode.window.showInformationMessage("Dextree requires an open workspace folder.");
      return;
    }

    const indexer = await dependencies.getIndexer();
    const subgraph = await indexer.getWorkspaceSubgraph(root.uri.fsPath);

    if (subgraph.nodes.length === 0) {
      await vscode.window.showInformationMessage(
        "Dextree: Index your workspace first before exporting a Mermaid diagram.",
      );
      return;
    }

    const defaultUri = vscode.Uri.joinPath(root.uri, "dextree-graph.mmd");
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { "Mermaid Diagram": ["mmd"] },
      title: "Save Mermaid Diagram",
    });

    // User cancelled — exit silently (FR-007).
    if (saveUri === undefined) {
      return;
    }

    const rawTheme = vscode.workspace
      .getConfiguration("dextree.exporters")
      .get<string>("theme", "Light");
    // note: theme hardcoded to Light here for US1; FR-008 fully satisfied after T014
    const theme = isMermaidTheme(rawTheme) ? rawTheme : DEFAULT_MERMAID_THEME;

    const content = serializeToMermaid(subgraph, { theme });
    const encoded = new TextEncoder().encode(content);

    try {
      await vscode.workspace.fs.writeFile(saveUri, encoded);
    } catch (err) {
      // Attempt cleanup — if the file was partially written, remove it (FR-010).
      try {
        await vscode.workspace.fs.delete(saveUri, { useTrash: false });
      } catch {
        // Ignore cleanup errors — the primary error is what the user needs to see.
      }
      const reason = err instanceof Error ? err.message : String(err);
      await vscode.window.showErrorMessage("Dextree: Failed to write Mermaid file: " + reason);
      return;
    }

    await vscode.window.showInformationMessage(
      "Dextree: Mermaid diagram saved to " + saveUri.fsPath,
    );
  };
}
