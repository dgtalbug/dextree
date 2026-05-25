import {
  DEFAULT_MERMAID_THEME,
  isMermaidTheme,
  serializeToScopedMermaid,
  type MermaidDirection,
  type MermaidGranularity,
  type MermaidScope,
} from "@dextree/exporters";
import type { Indexer } from "@dextree/core";
import * as vscode from "vscode";

export interface ExportMermaidCommandDependencies {
  getIndexer: () => Promise<Pick<Indexer, "getWorkspaceSubgraph">>;
}

interface ScopePickItem extends vscode.QuickPickItem {
  scope: MermaidScope;
}

interface GranularityPickItem extends vscode.QuickPickItem {
  granularity: MermaidGranularity;
}

interface DirectionPickItem extends vscode.QuickPickItem {
  direction: MermaidDirection;
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

    const scope = await pickScope(root.uri.fsPath);
    if (scope === undefined) {
      // User cancelled at scope step — exit silently (FR-007).
      return;
    }

    const granularity = await pickGranularity();
    if (granularity === undefined) {
      return;
    }

    const direction = await pickDirection();
    if (direction === undefined) {
      return;
    }

    const defaultUri = vscode.Uri.joinPath(root.uri, "dextree-graph.mmd");
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { "Mermaid Diagram": ["mmd"] },
      title: "Save Mermaid Diagram",
    });

    if (saveUri === undefined) {
      return;
    }

    const rawTheme = vscode.workspace
      .getConfiguration("dextree.exporters")
      .get<string>("theme", "Light");
    const theme = isMermaidTheme(rawTheme) ? rawTheme : DEFAULT_MERMAID_THEME;

    let content: string;
    try {
      content = serializeToScopedMermaid(subgraph, {
        diagram: "flowchart",
        scope,
        granularity,
        direction,
        theme,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await vscode.window.showWarningMessage("Dextree: " + reason);
      return;
    }

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

/**
 * First QuickPick step. "Current file" is offered only when the active editor
 * sits inside the workspace root; otherwise just "Workspace" is shown. US2
 * (Granularity) and US3 (Direction) layer additional steps after this one.
 */
async function pickScope(workspaceRoot: string): Promise<MermaidScope | undefined> {
  const items: ScopePickItem[] = [
    {
      label: "Workspace",
      description: "Export every indexed file and symbol",
      scope: { kind: "workspace" },
    },
  ];

  const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  const relativePath = activePath ? toWorkspaceRelative(activePath, workspaceRoot) : undefined;
  if (relativePath !== undefined) {
    items.push({
      label: "Current file",
      description: relativePath,
      scope: { kind: "file", relativePath },
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: "Mermaid Export — Scope",
    placeHolder: "Pick what to export",
    canPickMany: false,
  });

  return picked?.scope;
}

/**
 * Second QuickPick step. Bounded to package / file / symbol per the slice
 * 027 data model. Package is listed first because it's the coarsest and
 * the most likely to keep an export readable on a large workspace.
 */
async function pickGranularity(): Promise<MermaidGranularity | undefined> {
  const items: GranularityPickItem[] = [
    {
      label: "Package",
      description: "Architectural view — one node per package / top folder",
      granularity: "package",
    },
    {
      label: "File",
      description: "File-level view — one node per indexed file",
      granularity: "file",
    },
    {
      label: "Symbol",
      description: "Full detail — every indexed symbol kept",
      granularity: "symbol",
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: "Mermaid Export — Granularity",
    placeHolder: "Pick the level of detail",
    canPickMany: false,
  });

  return picked?.granularity;
}

/**
 * Third QuickPick step. Auto is the default and resolves to the per-scope
 * inference inside the exporter (LR for caller/callee scopes, TB otherwise).
 * Explicit tokens (TB / LR / BT / RL) pass straight through to the
 * `graph <DIR>` header in the .mmd output.
 */
async function pickDirection(): Promise<MermaidDirection | undefined> {
  const items: DirectionPickItem[] = [
    {
      label: "Auto",
      description: "Default for the chosen scope (LR for call chains, TB otherwise)",
      direction: "auto",
    },
    {
      label: "Top-down",
      description: "graph TB — files / hierarchies read top to bottom",
      direction: "TB",
    },
    {
      label: "Left-right",
      description: "graph LR — call chains read left to right",
      direction: "LR",
    },
    {
      label: "Bottom-up",
      description: "graph BT — inverted hierarchy",
      direction: "BT",
    },
    {
      label: "Right-left",
      description: "graph RL — inverted call chains",
      direction: "RL",
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: "Mermaid Export — Direction",
    placeHolder: "Pick the flowchart orientation",
    canPickMany: false,
  });

  return picked?.direction;
}

function toWorkspaceRelative(absolutePath: string, workspaceRoot: string): string | undefined {
  const normalizedRoot = workspaceRoot.endsWith("/") ? workspaceRoot : workspaceRoot + "/";
  if (!absolutePath.startsWith(normalizedRoot)) {
    return undefined;
  }
  return absolutePath.slice(normalizedRoot.length);
}
