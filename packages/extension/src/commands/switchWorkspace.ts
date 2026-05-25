/**
 * `dextree.switchWorkspace` command (slice 024).
 *
 * Reads the global workspace registry, shows a quick-pick of indexed
 * workspaces, and pushes the selected workspace's graph into the open panel.
 * The active indexer stays bound to the VS Code workspace root — the switch
 * is display-only.
 */

import * as vscode from "vscode";

import { listIndexedWorkspaces } from "../cache/workspaceRegistry.js";

export interface SwitchWorkspaceCommandDeps {
  getGlobalStoragePath: () => string | undefined;
  getActiveWorkspaceRoot: () => string | undefined;
  switchWorkspace: (workspaceRoot: string) => Promise<void>;
}

interface WorkspaceQuickPickItem extends vscode.QuickPickItem {
  workspaceRoot: string;
  isActive: boolean;
}

export function createSwitchWorkspaceCommand(
  deps: SwitchWorkspaceCommandDeps,
): () => Promise<void> {
  return async () => {
    const globalStoragePath = deps.getGlobalStoragePath();
    if (globalStoragePath === undefined) {
      await vscode.window.showErrorMessage(
        "Dextree: Global storage is unavailable for this VS Code session.",
      );
      return;
    }

    const activeRoot = deps.getActiveWorkspaceRoot() ?? "";
    const records = await listIndexedWorkspaces(globalStoragePath, activeRoot);

    if (records.length === 0) {
      await vscode.window.showInformationMessage(
        "Dextree: No workspaces indexed yet. Run Dextree: Index Workspace to get started.",
      );
      return;
    }

    const items: WorkspaceQuickPickItem[] = records.map((record) => ({
      label: record.name,
      description: record.workspaceRoot,
      ...(record.isActive && { detail: "$(check) Currently active" }),
      workspaceRoot: record.workspaceRoot,
      isActive: record.isActive,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a workspace to display in Dextree",
      matchOnDescription: true,
    });

    if (picked === undefined || picked.isActive) {
      return;
    }

    await deps.switchWorkspace(picked.workspaceRoot);
  };
}
