import type { Indexer } from "@dextree/core";
import {
  appendMermaidClickLinks,
  generateMermaidPreview,
  type MermaidClickLinkPolicy,
  type MermaidClickTarget,
  type MermaidPreviewOptions,
  type MermaidPreviewResult,
} from "@dextree/exporters";
import * as vscode from "vscode";

import type { InferredMermaidExport, MermaidSelectionContext } from "./inferredMermaidExport.js";
import { resolveInferredMermaidExport } from "./inferredMermaidExport.js";

export interface ExportMermaidCommandDependencies {
  getIndexer: () => Promise<Pick<Indexer, "getWorkspaceSubgraph">>;
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

/**
 * Execute an inferred Mermaid export. Used by selection-aware entry points
 * (slice 030, US1) and focused export commands (slice 030, US3).
 */
export async function executeInferredMermaidExport(
  dependencies: ExportMermaidCommandDependencies,
  inferred: InferredMermaidExport,
): Promise<void> {
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

  const preview = generateMermaidPreview(subgraph, {
    diagram: inferred.diagram,
    scope: inferred.scope,
    granularity: "symbol",
    direction: inferred.direction,
    theme: "light",
  });

  if (preview.status === "ok") {
    const enriched = applyClickLinksToPreview(preview.source, inferred.diagram, subgraph);
    if (enriched !== preview.source) {
      await dependencies.openMermaidPreview({ ...preview, source: enriched });
      return;
    }
  }

  await dependencies.openMermaidPreview(preview);
}

function applyClickLinksToPreview(
  source: string,
  diagram: "flowchart" | "classDiagram",
  subgraph: { nodes: Array<{ id: string; filePath?: string; startLine?: number }> },
): string {
  const config = vscode.workspace.getConfiguration("dextree.exporters");
  const includeClickLinks = config.get<boolean>("includeClickLinks", false);
  if (!includeClickLinks) return source;

  const policy: MermaidClickLinkPolicy = { includeLinks: true };
  const targets: MermaidClickTarget[] = [];
  for (const node of subgraph.nodes) {
    if (node.filePath && node.startLine !== undefined) {
      targets.push({ nodeId: node.id, filePath: node.filePath, line: node.startLine });
    }
  }
  return appendMermaidClickLinks(source, targets, policy);
}

/**
 * Start an inferred Mermaid export from a selection context. Resolves the
 * intent and context into inferred defaults, then delegates to the shared
 * export path. Fails closed with a user message when the context cannot be
 * satisfied.
 */
export async function startInferredMermaidExport(
  dependencies: ExportMermaidCommandDependencies,
  intent: InferredMermaidExport["intent"],
  context: MermaidSelectionContext,
): Promise<void> {
  const inferred = resolveInferredMermaidExport(intent, context);
  if (inferred === null) {
    await vscode.window.showInformationMessage(
      "Dextree: Cannot export Mermaid diagram from the current selection.",
    );
    return;
  }
  await executeInferredMermaidExport(dependencies, inferred);
}
