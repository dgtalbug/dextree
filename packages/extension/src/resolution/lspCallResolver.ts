import type { NodeLocation, PreciseCallEdge, PreciseLocationResolver } from "@dextree/core";
import * as vscode from "vscode";

export type { NodeLocation, PreciseCallEdge };

/**
 * Resolves precise callers/callees for a selected node using the language server
 * the user already has installed — zero per-language code on our side. Implements
 * core's {@link PreciseLocationResolver} (RULE-ARCH-010, the injected precise
 * tier): `core` owns the contract; the VS Code host implements it. Degrades
 * gracefully — if no server answers (not installed, not warmed, no call-hierarchy
 * support) it returns an empty list and the heuristic tier stands.
 *
 * Host-only: depends on the VS Code command bridge, so it lives in the extension,
 * never in `core` (RULE-ARCH-005).
 */
export class LspCallResolver implements PreciseLocationResolver {
  readonly tier = "precise" as const;

  async resolve(node: NodeLocation, direction: "in" | "out"): Promise<PreciseCallEdge[]> {
    const uri = vscode.Uri.file(node.filePath);
    const position = new vscode.Position(node.line, node.column);

    let items: vscode.CallHierarchyItem[] | undefined;
    try {
      items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
        "vscode.prepareCallHierarchy",
        uri,
        position,
      );
    } catch {
      // Server threw / not ready — degrade to heuristic (return nothing).
      return [];
    }

    if (!items || items.length === 0) {
      return [];
    }

    const root = items[0]!;
    if (direction === "in") {
      const calls =
        (await safeExec<vscode.CallHierarchyIncomingCall[]>("vscode.provideIncomingCalls", root)) ??
        [];
      return calls.map((c) => fromItem(c.from));
    }

    const calls =
      (await safeExec<vscode.CallHierarchyOutgoingCall[]>("vscode.provideOutgoingCalls", root)) ??
      [];
    return calls.map((c) => fromItem(c.to));
  }
}

async function safeExec<T>(
  command: string,
  item: vscode.CallHierarchyItem,
): Promise<T | undefined> {
  try {
    return await vscode.commands.executeCommand<T>(command, item);
  } catch {
    return undefined;
  }
}

function fromItem(item: vscode.CallHierarchyItem): PreciseCallEdge {
  return {
    name: item.name,
    filePath: item.uri.fsPath,
    line: item.range.start.line,
    tier: "precise",
    confidence: 1,
  };
}
