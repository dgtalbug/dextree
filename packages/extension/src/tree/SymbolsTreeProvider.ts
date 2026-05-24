import { basename } from "node:path";

import type { Indexer, StoredFile, StoredSymbol, SymbolKind } from "@dextree/core";
import * as vscode from "vscode";

import type { Logger } from "../logger.js";

const ROOT_ACTIONS = [
  {
    label: "Index Workspace",
    command: "dextree.indexWorkspace",
    icon: "sync",
    description: "Scan the current workspace",
  },
] as const;

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
  method: "symbol-method",
};

function kindCodicon(kind: SymbolKind): string {
  return KIND_CODICON[kind] ?? "symbol-misc";
}

// ---------------------------------------------------------------------------
// Tree nodes
// ---------------------------------------------------------------------------

export class TreeDirNode {
  readonly kind = "dir" as const;
  readonly treeItem: vscode.TreeItem;

  constructor(
    readonly dirName: string,
    readonly children: TreeNode[],
  ) {
    const item = new vscode.TreeItem(dirName, vscode.TreeItemCollapsibleState.Collapsed);
    item.iconPath = new vscode.ThemeIcon("folder");
    item.contextValue = "dextreeDir";
    this.treeItem = item;
  }
}

export class TreeActionNode {
  readonly kind = "action" as const;
  readonly treeItem: vscode.TreeItem;

  constructor(action: (typeof ROOT_ACTIONS)[number]) {
    const item = new vscode.TreeItem(action.label, vscode.TreeItemCollapsibleState.None);
    item.description = action.description;
    item.tooltip = action.label;
    item.contextValue = "dextreeAction";
    item.iconPath = new vscode.ThemeIcon(action.icon);
    item.command = {
      command: action.command,
      title: action.label,
    };
    this.treeItem = item;
  }
}

export class TreeFileNode {
  readonly kind = "file" as const;
  readonly treeItem: vscode.TreeItem;

  constructor(
    readonly file: StoredFile,
    workspaceUri?: vscode.Uri,
  ) {
    const item = new vscode.TreeItem(
      basename(file.relativePath),
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.description = file.relativePath;
    item.tooltip = file.relativePath;
    item.contextValue = "dextreeFile";

    if (workspaceUri !== undefined) {
      const fileUri = vscode.Uri.joinPath(workspaceUri, file.relativePath);
      item.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [fileUri],
      };
    }

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

export type TreeNode = TreeActionNode | TreeDirNode | TreeFileNode | TreeSymbolNode;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively groups files into a directory tree.
 * Each path segment becomes a TreeDirNode; leaf files become TreeFileNodes.
 */
function buildDirTree(files: StoredFile[], prefix: string, workspaceUri?: vscode.Uri): TreeNode[] {
  const dirMap = new Map<string, StoredFile[]>();
  const rootFiles: StoredFile[] = [];

  for (const file of files) {
    const relative = prefix ? file.relativePath.slice(prefix.length + 1) : file.relativePath;
    const slashIdx = relative.indexOf("/");
    if (slashIdx === -1) {
      rootFiles.push(file);
    } else {
      const segment = relative.slice(0, slashIdx);
      const existing = dirMap.get(segment);
      if (existing !== undefined) {
        existing.push(file);
      } else {
        dirMap.set(segment, [file]);
      }
    }
  }

  const nodes: TreeNode[] = [];
  for (const [segment, segFiles] of dirMap) {
    const childPrefix = prefix ? `${prefix}/${segment}` : segment;
    nodes.push(new TreeDirNode(segment, buildDirTree(segFiles, childPrefix, workspaceUri)));
  }
  for (const file of rootFiles) {
    nodes.push(new TreeFileNode(file, workspaceUri));
  }
  return nodes;
}

function buildRootTree(files: StoredFile[], workspaceUri?: vscode.Uri): TreeNode[] {
  return [
    ...ROOT_ACTIONS.map((action) => new TreeActionNode(action)),
    ...buildDirTree(files, "", workspaceUri),
  ];
}

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
    private readonly canHydrateCache: () => boolean = () => true,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element.treeItem;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    // Root call — return files grouped by top-level directory
    if (element === undefined) {
      const indexer = this.getIndexer();
      if (indexer === null || !this.canHydrateCache()) {
        return buildRootTree([]);
      }
      try {
        const workspaceUri = this.getWorkspaceUri();
        const files = await indexer.getAllFiles();
        return buildRootTree(files, workspaceUri);
      } catch (error) {
        this.logger.error("Failed to load indexed files", error);
        return buildRootTree([]);
      }
    }

    if (element.kind === "action") {
      return [];
    }

    // Dir node — return its pre-built children
    if (element.kind === "dir") {
      return element.children;
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
