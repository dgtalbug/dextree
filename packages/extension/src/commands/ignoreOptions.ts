import type { WorkspaceIgnoreOptions } from "@dextree/core";
import * as vscode from "vscode";

/**
 * Read the user's opt-in ignore toggles from the `dextree.*` settings, to pass
 * to `createWorkspaceIgnore`. Both default off so indexing behavior is unchanged
 * until the user enables them.
 */
export function readIgnoreOptions(scope?: vscode.Uri): WorkspaceIgnoreOptions {
  // Defensive: a config-read failure must never break indexing. Falling back to
  // both-off preserves the default (current) behavior.
  try {
    const config = vscode.workspace.getConfiguration("dextree", scope ?? null);
    return {
      ignoreDocumentation: config.get<boolean>("ignoreDocumentation", false),
      ignoreTests: config.get<boolean>("ignoreTests", false),
    };
  } catch {
    return { ignoreDocumentation: false, ignoreTests: false };
  }
}
