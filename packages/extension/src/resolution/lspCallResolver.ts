import * as vscode from "vscode";

/** A precise caller/callee edge resolved by the user's language server. */
export interface PreciseCallEdge {
  /** Display name of the related symbol (the caller or callee). */
  name: string;
  /** Absolute file path of the related symbol. */
  filePath: string;
  /** 0-based start line of the related symbol. */
  line: number;
  /** Resolution tier — always "precise" for LSP results. */
  tier: "precise";
  confidence: number;
}

/** Where the selected node lives, so the LSP can be queried at that position. */
export interface NodeLocation {
  filePath: string;
  /** 0-based line. */
  line: number;
  /** 0-based column. */
  column: number;
}

/**
 * Resolves precise callers/callees for a selected node using the language server
 * the user already has installed — zero per-language code on our side
 * (RULE-ARCH-010, the injected precise tier). Degrades gracefully: if no server
 * answers (not installed, not warmed, no call-hierarchy support) it returns an
 * empty list and the heuristic tier stands.
 *
 * Host-only: depends on the VS Code command bridge, so it lives in the extension,
 * never in `core` (RULE-ARCH-005).
 */
export class LspCallResolver {
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
