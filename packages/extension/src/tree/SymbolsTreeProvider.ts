import { basename } from "node:path";

import type { Indexer, StoredFile, StoredSymbol, SymbolKind } from "@dextree/core";
import * as vscode from "vscode";

import type { Logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Kind → Codicon mapping ($(symbol-*) family)
// ---------------------------------------------------------------------------

const KIND_CODICON: Record<SymbolKind, string> = {
  function: "symbol-function",
  class: "symbol-class",
  interface: "symbol-interface",
  type: "symbol-type-parameter",
  enum: "symbol-enum",
  variable: "symbol-variable",
};

function kindCodicon(kind: SymbolKind): string {
  return KIND_CODICON[kind] ?? "symbol-misc";
}

// ---------------------------------------------------------------------------
// Tree nodes
// ---------------------------------------------------------------------------

export class TreeFileNode {
  readonly kind = "file" as const;
  readonly treeItem: vscode.TreeItem;

  constructor(readonly file: StoredFile) {
    const item = new vscode.TreeItem(
      basename(file.relativePath),
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.description = file.relativePath;
    item.tooltip = file.relativePath;
    item.contextValue = "dextreeFile";
    this.treeItem = item;
  }
}

export class TreeSymbolNode {
  readonly kind = "symbol" as const;
  readonly treeItem: vscode.TreeItem;

  constructor(symbol: StoredSymbol, fileUri: vscode.Uri) {
    const label = `${symbol.name} (${symbol.kind})`;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(kindCodicon(symbol.kind));
    item.contextValue = "dextreeSymbol";

    const startLine = Math.max(0, symbol.range?.startLine ?? 0);
    const position = new vscode.Position(startLine, 0);
    const selection = new vscode.Range(position, position);

    item.command = {
      command: "vscode.open",
      title: "Go to Symbol",
      arguments: [fileUri, { selection }],
    };

    this.treeItem = item;
  }
}

export type TreeNode = TreeFileNode | TreeSymbolNode;

// ---------------------------------------------------------------------------
// TreeDataProvider
// ---------------------------------------------------------------------------

export class SymbolsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly getIndexer: () => Indexer | null,
    private readonly logger: Logger,
    private readonly getWorkspaceUri: () => vscode.Uri | undefined,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element.treeItem;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    // Root call — return all indexed files
    if (element === undefined) {
      const indexer = this.getIndexer();
      if (indexer === null) {
        return [];
      }
      try {
        const files = await indexer.getAllFiles();
        return files.map((file) => new TreeFileNode(file));
      } catch (error) {
        this.logger.error("Failed to load indexed files", error);
        return [];
      }
    }

    // File node — return its symbols
    if (element.kind === "file") {
      const indexer = this.getIndexer();
      if (indexer === null) {
        return [];
      }
      const workspaceUri = this.getWorkspaceUri();
      if (workspaceUri === undefined) {
        return [];
      }
      try {
        const symbols = await indexer.getSymbols(element.file.relativePath);
        return symbols.map((symbol) => {
          const fileUri = vscode.Uri.joinPath(workspaceUri, element.file.relativePath);
          return new TreeSymbolNode(symbol, fileUri);
        });
      } catch (error) {
        this.logger.error(`Failed to load symbols for ${element.file.relativePath}`, error);
        return [];
      }
    }

    // Symbol nodes are leaf nodes
    return [];
  }
}
