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
  TreeActionNode,
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
    getWorkspaceSubgraph: vi
      .fn<() => Promise<{ nodes: unknown[]; edges: unknown[] }>>()
      .mockResolvedValue({
        nodes: [],
        edges: [],
      }),
    dispose: vi.fn(),
  };
}

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dispose: vi.fn(),
  };
}

const mockWorkspaceUri = { fsPath: "/workspace" };

function makeProvider(
  indexer: ReturnType<typeof makeIndexer> | null = makeIndexer(),
  canHydrateCache = true,
) {
  return new SymbolsTreeProvider(
    () => indexer as never,
    makeLogger(),
    () => mockWorkspaceUri as never,
    () => canHydrateCache,
  );
}

// ---------------------------------------------------------------------------
// US1: Root children (all indexed files)
// ---------------------------------------------------------------------------

describe("SymbolsTreeProvider — root children (US1)", () => {
  beforeEach(() => {
    fireTreeData.mockReset();
  });

  it("shows persistent action nodes when indexer is null (before any indexing)", async () => {
    const provider = makeProvider(null);
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(TreeActionNode);
    expect(children[0]?.treeItem.label).toBe("Index Workspace");
  });

  it("keeps the action nodes visible when no files are indexed yet", async () => {
    const indexer = makeIndexer();
    indexer.getAllFiles.mockResolvedValue([]);
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(1);
    expect(children[0]?.treeItem.label).toBe("Index Workspace");
  });

  it("keeps the action nodes visible when cache reuse is not allowed even if indexed files exist", async () => {
    const indexer = makeIndexer();
    indexer.getAllFiles.mockResolvedValue([
      {
        id: "f1",
        relativePath: "src/greet.ts",
        language: "typescript",
        path: "/workspace/src/greet.ts",
        hash: "abc123",
      },
    ]);
    const provider = makeProvider(indexer, false);
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(1);
    expect(children[0]?.treeItem.label).toBe("Index Workspace");
  });

  it("groups files under a shared directory into a TreeDirNode", async () => {
    const indexer = makeIndexer();
    indexer.getAllFiles.mockResolvedValue([
      {
        id: "f1",
        relativePath: "src/greet.ts",
        language: "typescript",
        path: "/workspace/src/greet.ts",
        hash: "abc123",
      },
      {
        id: "f2",
        relativePath: "src/utils.ts",
        language: "typescript",
        path: "/workspace/src/utils.ts",
        hash: "abc123",
      },
    ]);
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(2);
    expect(children[0]).toBeInstanceOf(TreeActionNode);
    expect(children[1]).toBeInstanceOf(TreeDirNode);
    expect(children[1]?.treeItem.label).toBe("src");
  });

  it("root-level files (no directory) appear as TreeFileNodes directly", async () => {
    const indexer = makeIndexer();
    indexer.getAllFiles.mockResolvedValue([
      {
        id: "f1",
        relativePath: "index.ts",
        language: "typescript",
        path: "/workspace/index.ts",
        hash: "abc123",
      },
    ]);
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(2);
    expect(children[1]).toBeInstanceOf(TreeFileNode);
    expect(children[1]?.treeItem.label).toBe("index.ts");
  });

  it("multiple directories produce one TreeDirNode per directory", async () => {
    const indexer = makeIndexer();
    indexer.getAllFiles.mockResolvedValue([
      {
        id: "f1",
        relativePath: "src/greet.ts",
        language: "typescript",
        path: "/workspace/src/greet.ts",
        hash: "abc123",
      },
      {
        id: "f2",
        relativePath: "test/greet.test.ts",
        language: "typescript",
        path: "/workspace/test/greet.test.ts",
        hash: "abc123",
      },
    ]);
    const provider = makeProvider(indexer);
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(3);
    const labels = children.slice(1).map((c) => c.treeItem.label);
    expect(labels).toContain("src");
    expect(labels).toContain("test");
  });

  it("catches getAllFiles error, logs it, and still returns action nodes (FR-009)", async () => {
    const indexer = makeIndexer();
    const logger = makeLogger();
    indexer.getAllFiles.mockRejectedValue(new Error("DB connection lost"));
    const provider = new SymbolsTreeProvider(
      () => indexer as never,
      logger,
      () => mockWorkspaceUri as never,
    );
    const children = await provider.getChildren(undefined);
    expect(children).toHaveLength(1);
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
      path: "/workspace/src/greet.ts",
      hash: "abc123",
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
      {
        id: "f1",
        relativePath: "src/parser/greet.ts",
        language: "typescript",
        path: "/workspace/src/parser/greet.ts",
        hash: "abc123",
      },
    ]);
    const provider = makeProvider(indexer);
    const root = await provider.getChildren(undefined);
    // src/ dir
    expect(root).toHaveLength(2);
    expect(root[1]).toBeInstanceOf(TreeDirNode);
    expect(root[1]?.treeItem.label).toBe("src");
    // src/parser/ sub-dir
    const srcChildren = await provider.getChildren(root[1]);
    expect(srcChildren[0]).toBeInstanceOf(TreeDirNode);
    expect(srcChildren[0]?.treeItem.label).toBe("parser");
    // src/parser/greet.ts file
    const parserChildren = await provider.getChildren(srcChildren[0]);
    expect(parserChildren[0]).toBeInstanceOf(TreeFileNode);
    expect(parserChildren[0]?.treeItem.label).toBe("greet.ts");
  });

  it("renders directory nodes collapsed by default", () => {
    const dirNode = new TreeDirNode("src", []);
    expect(dirNode.treeItem.collapsibleState).toBe(1);
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
      path: "/workspace/src/greet.ts",
      hash: "abc123",
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
      path: "/workspace/src/empty.ts",
      hash: "abc123",
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
      path: "/workspace/src/err.ts",
      hash: "abc123",
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
      path: "/workspace/src/x.ts",
      hash: "abc123",
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

  it("nests methods under their enclosing class via enclosingSymbolId", async () => {
    const indexer = makeIndexer();
    indexer.getSymbols.mockResolvedValue([
      {
        id: "cls",
        fqn: "src/svc.ts:Service",
        name: "Service",
        kind: "class",
        fileId: "f1",
        range: { startLine: 0, startCol: 0, endLine: 20, endCol: 1 },
        language: "typescript",
      },
      {
        id: "m1",
        fqn: "src/svc.ts:Service.run",
        name: "run",
        kind: "method",
        fileId: "f1",
        enclosingSymbolId: "cls",
        range: { startLine: 2, startCol: 2, endLine: 4, endCol: 3 },
        language: "typescript",
      },
      {
        id: "free",
        fqn: "src/svc.ts:helper",
        name: "helper",
        kind: "function",
        fileId: "f1",
        range: { startLine: 22, startCol: 0, endLine: 24, endCol: 1 },
        language: "typescript",
      },
    ]);
    const fileNode = new TreeFileNode({
      id: "f1",
      relativePath: "src/svc.ts",
      language: "typescript",
      path: "/workspace/src/svc.ts",
      hash: "abc123",
    });
    const provider = makeProvider(indexer);

    // Top level: the class and the free function, not the method.
    const top = await provider.getChildren(fileNode);
    expect(top).toHaveLength(2);
    expect(top[0]?.treeItem.label).toBe("Service (class)");
    expect(top[1]?.treeItem.label).toBe("helper (function)");
    // Collapsed (1) because it has a member; mirrors the mock's enum mapping.
    expect(top[0]?.treeItem.collapsibleState).toBe(1);

    // The class node yields its method as a child.
    const classChildren = await provider.getChildren(top[0]);
    expect(classChildren).toHaveLength(1);
    expect(classChildren[0]?.treeItem.label).toBe("run (method)");
    expect(classChildren[0]?.treeItem.collapsibleState).toBe(0); // None — leaf
  });

  it("surfaces a symbol whose enclosing id is absent from the file as top-level", async () => {
    const indexer = makeIndexer();
    indexer.getSymbols.mockResolvedValue([
      {
        id: "orphan",
        fqn: "src/svc.ts:orphan",
        name: "orphan",
        kind: "method",
        fileId: "f1",
        enclosingSymbolId: "not-in-file",
        range: { startLine: 0, startCol: 0, endLine: 1, endCol: 1 },
        language: "typescript",
      },
    ]);
    const fileNode = new TreeFileNode({
      id: "f1",
      relativePath: "src/svc.ts",
      language: "typescript",
      path: "/workspace/src/svc.ts",
      hash: "abc123",
    });
    const provider = makeProvider(indexer);
    const top = await provider.getChildren(fileNode);
    expect(top).toHaveLength(1);
    expect(top[0]?.treeItem.label).toBe("orphan (method)");
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
      path: "/workspace/src/x.ts",
      hash: "abc123",
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
      path: "/workspace/src/greet.ts",
      hash: "abc123",
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
      path: "/workspace/src/x.ts",
      hash: "abc123",
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

// ---------------------------------------------------------------------------
// Slice 030 — Tree node export metadata (resourceUri, tooltip)
// ---------------------------------------------------------------------------

describe("SymbolsTreeProvider — slice 030 export metadata", () => {
  it("TreeFileNode sets resourceUri when workspaceUri is provided", () => {
    const file = {
      id: "f1",
      relativePath: "src/greet.ts",
      language: "typescript",
      path: "/workspace/src/greet.ts",
      hash: "abc123",
    };
    const node = new TreeFileNode(file, { fsPath: "/workspace" } as never);
    expect(node.treeItem.resourceUri).toBeDefined();
    expect((node.treeItem.resourceUri as { fsPath: string })?.fsPath).toBe(
      "/workspace/src/greet.ts",
    );
  });

  it("TreeFileNode does not set resourceUri when workspaceUri is undefined", () => {
    const file = {
      id: "f1",
      relativePath: "src/greet.ts",
      language: "typescript",
      path: "/workspace/src/greet.ts",
      hash: "abc123",
    };
    const node = new TreeFileNode(file);
    expect(node.treeItem.resourceUri).toBeUndefined();
  });

  it("TreeSymbolNode sets tooltip with name, kind, and id", () => {
    const symbol = {
      id: "sym-42",
      fqn: "src/greet.ts:greet",
      name: "greet",
      kind: "function" as const,
      fileId: "f1",
      range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 },
      language: "typescript",
    };
    const node = new TreeSymbolNode(symbol, { fsPath: "/workspace/src/greet.ts" } as never);
    expect(node.treeItem.tooltip).toBe("greet (function) — sym-42");
  });
});
