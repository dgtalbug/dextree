import type { Indexer } from "@dextree/core";
import {
  generateMermaidPreview,
  type MermaidPreviewOptions,
  type MermaidPreviewResult,
} from "@dextree/exporters";
import * as vscode from "vscode";

export interface ExportMermaidCommandDependencies {
  getIndexer: () => Promise<Pick<Indexer, "getWorkspaceSubgraph">>;
  /**
   * Opens the Mermaid preview scene in the webview with the given preview
   * result. Wired in `extension.ts` to call `WebviewPanelManager.create(...)`
   * followed by `WebviewPanelManager.pushMermaidPreview(...)` so the panel
   * is guaranteed to be open before the message is delivered.
   */
  openMermaidPreview: (preview: MermaidPreviewResult) => Promise<void> | void;
}

/**
 * Default preview options used when the command opens the preview tab from
 * the command palette or the existing graph-toolbar export button. Slice 029
 * deliberately removes the slice 027/028 QuickPick chain (Diagram / Scope /
 * Granularity / Direction) in favour of inline controls on the preview tab
 * itself (US2 in PR-B). The `theme` here is a host-side default that the
 * webview re-resolves against the live VS Code theme on inline rerender;
 * for the initial open it is good enough to thread `light` through the
 * router so the source generation is deterministic.
 */
const DEFAULT_PREVIEW_OPTIONS: MermaidPreviewOptions = {
  diagram: "flowchart",
  scope: { kind: "workspace" },
  granularity: "symbol",
  direction: "auto",
  theme: "light",
};

/**
 * `dextree.exportMermaid` command body (slice 029).
 *
 * Before slice 029 this command walked the user through a 4-step QuickPick
 * (Diagram → Scope → Granularity → Direction) and a save dialog. Slice 029
 * replaces both surfaces with the Mermaid preview tab, which hosts the same
 * controls inline (US2) and offers `.mmd` / `.svg` / `.png` / clipboard /
 * Markdown-snippet output actions (US3) without ever closing.
 *
 * In PR-A the command only opens the preview at workspace + symbol +
 * flowchart + auto defaults; inline controls and output actions ship in
 * the follow-up PRs.
 */
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

    const preview = generateMermaidPreview(subgraph, DEFAULT_PREVIEW_OPTIONS);
    await dependencies.openMermaidPreview(preview);
  };
}
