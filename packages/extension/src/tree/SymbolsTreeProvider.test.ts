import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vscode mock — must be declared before importing the provider
// ---------------------------------------------------------------------------

const fireTreeData = vi.fn();

vi.mock("vscode", () => ({
  TreeItem: class MockTreeItem {
    label: string | undefined;
    collapsibleState: number;
    description?: string;
    tooltip?: string;
    contextValue?: string;
    iconPath?: unknown;
    command?: unknown;
    constructor(label: string | undefined, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class MockThemeIcon {
    constructor(public id: string) {}
  },
  EventEmitter: class MockEventEmitter {
    fire = fireTreeData;
    event = Object.assign(vi.fn(), { dispose: vi.fn() });
    dispose = vi.fn();
  },
  Position: class MockPosition {
    constructor(
      public line: number,
      public character: number,
    ) {}
  },
  Range: class MockRange {
    constructor(
      public start: unknown,
      public end: unknown,
    ) {}
  },
  Uri: {
    joinPath: (_base: unknown, ...segments: string[]) => ({
      fsPath: `/workspace/${segments.join("/")}`,
    }),
  },
}));

import {
  SymbolsTreeProvider,
  TreeDirNode,
  TreeFileNode,
  TreeSymbolNode,
} from "./SymbolsTreeProvider.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIndexer() {
  return {
    initialize: vi.fn(),
    indexFile: vi.fn(),
    getSymbols: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    getAllFiles: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    dispose: vi.fn(),
  };
}

function makeLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    dispose: vi.fn(),
  };
}

const mockWorkspaceUri = { fsPath: "/workspace" };

function makeProvider(indexer: ReturnType<typeof makeIndexer> | null = makeIndexer()) {
  return new SymbolsTreeProvider(
    () => indexer as never,
    makeLogger(),
    () => mockWorkspaceUri as never,
  );
}

// ---------------------------------------------------------------------------
// US1: Root children (all indexed files)
// ---------------------------------------------------------------------------

describe("SymbolsTreeProvider — root children (US1)", () => {
  beforeEach(() => {
    fireTreeData.mockReset();
  });

  it("returns empty array when indexer is null (before any indexing)", async () => {
    const provider = makeProvider(null);
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(0);
  });

  it("returns empty array when getAllFiles returns [] (no files indexed yet)", async () => {
    const indexer = makeIndexer();
    indexer.getAllFiles.mockResolvedValue([]);
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(0);
  });

  it("groups files under a shared directory into a TreeDirNode", async () => {
    const indexer = makeIndexer();
    indexer.getAllFiles.mockResolvedValue([
      { id: "f1", relativePath: "src/greet.ts", language: "typescript" },
      { id: "f2", relativePath: "src/utils.ts", language: "typescript" },
    ]);
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(TreeDirNode);
    expect(children[0]?.treeItem.label).toBe("src");
  });

  it("root-level files (no directory) appear as TreeFileNodes directly", async () => {
    const indexer = makeIndexer();
    indexer.getAllFiles.mockResolvedValue([
      { id: "f1", relativePath: "index.ts", language: "typescript" },
    ]);
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(TreeFileNode);
    expect(children[0]?.treeItem.label).toBe("index.ts");
  });

  it("multiple directories produce one TreeDirNode per directory", async () => {
    const indexer = makeIndexer();
    indexer.getAllFiles.mockResolvedValue([
      { id: "f1", relativePath: "src/greet.ts", language: "typescript" },
      { id: "f2", relativePath: "test/greet.test.ts", language: "typescript" },
    ]);
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(2);
    const labels = children.map((c) => c.treeItem.label);
    expect(labels).toContain("src");
    expect(labels).toContain("test");
  });

  it("catches getAllFiles error, logs it, and returns [] (FR-009)", async () => {
    const indexer = makeIndexer();
    const logger = makeLogger();
    indexer.getAllFiles.mockRejectedValue(new Error("DB connection lost"));
    const provider = new SymbolsTreeProvider(
      () => indexer as never,
      logger,
      () => mockWorkspaceUri as never,
    );
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith("Failed to load indexed files", expect.any(Error));
  });

  it("fires onDidChangeTreeData when refresh() is called", () => {
    const provider = makeProvider();
    provider.refresh();
    expect(fireTreeData).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// US1: Dir node children (files)
// ---------------------------------------------------------------------------

describe("SymbolsTreeProvider — dir children", () => {
  it("returns pre-built children for a dir node", async () => {
    const fileNode = new TreeFileNode({
      id: "f1",
      relativePath: "src/greet.ts",
      language: "typescript",
    });
    const dirNode = new TreeDirNode("src", [fileNode]);
    const provider = makeProvider();
    const children = await provider.getChildren(dirNode);
    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(TreeFileNode);
  });

  it("nests directories recursively", async () => {
    const indexer = makeIndexer();
    indexer.getAllFiles.mockResolvedValue([
      { id: "f1", relativePath: "src/parser/greet.ts", language: "typescript" },
    ]);
    const provider = makeProvider(indexer);
    const root = await provider.getChildren(undefined);
    // src/ dir
    expect(root).toHaveLength(1);
    expect(root[0]).toBeInstanceOf(TreeDirNode);
    expect(root[0]?.treeItem.label).toBe("src");
    // src/parser/ sub-dir
    const srcChildren = await provider.getChildren(root[0]);
    expect(srcChildren[0]).toBeInstanceOf(TreeDirNode);
    expect(srcChildren[0]?.treeItem.label).toBe("parser");
    // src/parser/greet.ts file
    const parserChildren = await provider.getChildren(srcChildren[0]);
    expect(parserChildren[0]).toBeInstanceOf(TreeFileNode);
    expect(parserChildren[0]?.treeItem.label).toBe("greet.ts");
  });
});

// ---------------------------------------------------------------------------
// US1: File node children (symbols)
// ---------------------------------------------------------------------------

describe("SymbolsTreeProvider — file children (US1)", () => {
  it("returns TreeSymbolNode[] for a file node with symbols", async () => {
    const indexer = makeIndexer();
    indexer.getSymbols.mockResolvedValue([
      {
        id: "s1",
        fqn: "src/greet.ts:greet",
        name: "greet",
        kind: "function",
        fileId: "f1",
        range: { startLine: 0, startCol: 0, endLine: 5, endCol: 1 },
        language: "typescript",
      },
    ]);
    const fileNode = new TreeFileNode({
      id: "f1",
      relativePath: "src/greet.ts",
      language: "typescript",
    });
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(fileNode);
    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(TreeSymbolNode);
    expect(children[0]?.treeItem.label).toBe("greet (function)");
  });

  it("returns [] for a file node with no symbols (FR-007: node still rendered)", async () => {
    const indexer = makeIndexer();
    indexer.getSymbols.mockResolvedValue([]);
    const fileNode = new TreeFileNode({
      id: "f1",
      relativePath: "src/empty.ts",
      language: "typescript",
    });
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(fileNode);
    expect(children).toHaveLength(0);
  });

  it("catches getSymbols error, logs it, and returns [] (FR-009)", async () => {
    const indexer = makeIndexer();
    const logger = makeLogger();
    indexer.getSymbols.mockRejectedValue(new Error("query failed"));
    const fileNode = new TreeFileNode({
      id: "f1",
      relativePath: "src/err.ts",
      language: "typescript",
    });
    const provider = new SymbolsTreeProvider(
      () => indexer as never,
      logger,
      () => mockWorkspaceUri as never,
    );
    const children = await provider.getChildren(fileNode);
    expect(children).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to load symbols for src/err.ts",
      expect.any(Error),
    );
  });

  it("returns [] for a file node when workspace URI is undefined", async () => {
    const indexer = makeIndexer();
    indexer.getSymbols.mockResolvedValue([{ id: "s1", name: "x", kind: "variable" }]);
    const fileNode = new TreeFileNode({
      id: "f1",
      relativePath: "src/x.ts",
      language: "typescript",
    });
    const provider = new SymbolsTreeProvider(
      () => indexer as never,
      makeLogger(),
      () => undefined,
    );
    const children = await provider.getChildren(fileNode);
    expect(children).toHaveLength(0);
  });

  it("returns [] for symbol nodes (leaf nodes have no children)", async () => {
    const symbolNode = new TreeSymbolNode(
      {
        id: "s1",
        fqn: "f:x",
        name: "x",
        kind: "variable",
        fileId: "f1",
        range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 },
        language: "typescript",
      },
      { fsPath: "/workspace/src/x.ts" } as never,
    );
    const provider = makeProvider();
    const children = await provider.getChildren(symbolNode);
    expect(children).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// US1: Symbol node Codicon icons (FR-010)
// ---------------------------------------------------------------------------

describe("SymbolsTreeProvider — symbol kind Codicons (US1 / FR-010)", () => {
  const cases: Array<[string, string]> = [
    ["function", "symbol-function"],
    ["class", "symbol-class"],
    ["interface", "symbol-interface"],
    ["type", "symbol-type-parameter"],
    ["enum", "symbol-enum"],
    ["variable", "symbol-variable"],
  ];

  it.each(cases)("kind '%s' maps to Codicon '%s'", async (kind, expectedCodicon) => {
    const indexer = makeIndexer();
    indexer.getSymbols.mockResolvedValue([
      {
        id: "s1",
        fqn: `f:x`,
        name: "x",
        kind,
        fileId: "f1",
        range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 },
        language: "typescript",
      },
    ]);
    const fileNode = new TreeFileNode({
      id: "f1",
      relativePath: "src/x.ts",
      language: "typescript",
    });
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(fileNode);
    const icon = children[0]?.treeItem.iconPath as { id: string } | undefined;
    expect(icon?.id).toBe(expectedCodicon);
  });
});

// ---------------------------------------------------------------------------
// US2: Navigation command (FR-004, FR-006)
// ---------------------------------------------------------------------------

describe("SymbolsTreeProvider — navigation command (US2)", () => {
  it("symbol node has vscode.open command with correct URI (FR-006)", async () => {
    const indexer = makeIndexer();
    indexer.getSymbols.mockResolvedValue([
      {
        id: "s1",
        fqn: "src/greet.ts:greet",
        name: "greet",
        kind: "function",
        fileId: "f1",
        range: { startLine: 2, startCol: 0, endLine: 7, endCol: 1 },
        language: "typescript",
      },
    ]);
    const fileNode = new TreeFileNode({
      id: "f1",
      relativePath: "src/greet.ts",
      language: "typescript",
    });
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(fileNode);
    const cmd = children[0]?.treeItem.command as
      | { command: string; arguments: unknown[] }
      | undefined;
    expect(cmd?.command).toBe("vscode.open");
    expect((cmd?.arguments?.[0] as { fsPath: string })?.fsPath).toBe("/workspace/src/greet.ts");
    const opts = cmd?.arguments?.[1] as { selection: { start: { line: number } } };
    expect(opts?.selection?.start?.line).toBe(2);
  });

  it("navigation falls back to line 0 when range startLine is 0 (FR-004 edge case)", async () => {
    const indexer = makeIndexer();
    indexer.getSymbols.mockResolvedValue([
      {
        id: "s1",
        fqn: "src/x.ts:x",
        name: "x",
        kind: "variable",
        fileId: "f1",
        range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 },
        language: "typescript",
      },
    ]);
    const fileNode = new TreeFileNode({
      id: "f1",
      relativePath: "src/x.ts",
      language: "typescript",
    });
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(fileNode);
    const cmd = children[0]?.treeItem.command as
      | { command: string; arguments: unknown[] }
      | undefined;
    const opts = cmd?.arguments?.[1] as { selection: { start: { line: number } } };
    expect(opts?.selection?.start?.line).toBe(0);
  });
});
