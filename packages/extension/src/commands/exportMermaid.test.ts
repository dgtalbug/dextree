import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// VS Code mock — slim surface since slice 029 removes the QuickPick + save
// dialog chain. The command body now only reads workspaceFolders and surfaces
// `showInformationMessage` for the two early-exit conditions.
// ---------------------------------------------------------------------------

const { showInformationMessage, getWorkspaceFolders, setWorkspaceFolders } = vi.hoisted(() => {
  let workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined = [
    { uri: { fsPath: "/workspace" } },
  ];

  return {
    showInformationMessage: vi.fn(),
    getWorkspaceFolders: () => workspaceFolders,
    setWorkspaceFolders: (folders: Array<{ uri: { fsPath: string } }> | undefined) => {
      workspaceFolders = folders;
    },
  };
});

vi.mock("vscode", () => ({
  window: {
    showInformationMessage,
  },
  workspace: {
    get workspaceFolders() {
      return getWorkspaceFolders();
    },
  },
}));

import { createExportMermaidCommand } from "./exportMermaid.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeIndexerStub(nodeCount: number) {
  return {
    getWorkspaceSubgraph: vi.fn(async () => ({
      nodes: Array.from({ length: nodeCount }, (_, i) => ({
        id: `node-${i}`,
        type: "file" as const,
        label: `src/file-${i}.ts`,
        filePath: `/workspace/src/file-${i}.ts`,
        startLine: 0,
      })),
      edges: [],
      frameworks: [],
    })),
  };
}

function resetMocks(): void {
  showInformationMessage.mockReset();
  setWorkspaceFolders([{ uri: { fsPath: "/workspace" } }]);
}

// ---------------------------------------------------------------------------
// Harness smoke tests
// ---------------------------------------------------------------------------

describe("createExportMermaidCommand — harness", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("returns a callable command function", () => {
    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
      openMermaidPreview: vi.fn(),
    });
    expect(typeof command).toBe("function");
  });

  it("bails out with an info message when no workspace folder is open", async () => {
    setWorkspaceFolders(undefined);
    const openMermaidPreview = vi.fn();
    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(1),
      openMermaidPreview,
    });

    await command();

    expect(showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("open workspace"));
    expect(openMermaidPreview).not.toHaveBeenCalled();
  });

  it("bails out with the index-first message when the workspace subgraph is empty", async () => {
    const openMermaidPreview = vi.fn();
    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(0),
      openMermaidPreview,
    });

    await command();

    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Index your workspace first"),
    );
    expect(openMermaidPreview).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Slice 029 US1 (PR-A) — command opens preview with default options
// ---------------------------------------------------------------------------

describe("createExportMermaidCommand — slice 029 PR-A: opens preview scene", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("opens preview with workspace + symbol + flowchart + auto + light defaults (T011)", async () => {
    const openMermaidPreview = vi.fn();
    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(2),
      openMermaidPreview,
    });

    await command();

    expect(openMermaidPreview).toHaveBeenCalledTimes(1);
    const preview = openMermaidPreview.mock.calls[0]?.[0] as { status: string; options?: object };
    expect(preview.status).toBe("ok");
    expect(preview.options).toEqual({
      diagram: "flowchart",
      scope: { kind: "workspace" },
      granularity: "symbol",
      direction: "auto",
      theme: "light",
    });
  });

  it("threads the preview source through to the openMermaidPreview callback (T011)", async () => {
    const openMermaidPreview = vi.fn();
    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(2),
      openMermaidPreview,
    });

    await command();

    const preview = openMermaidPreview.mock.calls[0]?.[0] as {
      status: string;
      source?: string;
      title?: string;
    };
    expect(preview.status).toBe("ok");
    expect(typeof preview.source).toBe("string");
    expect(preview.source).toContain("graph TB");
    expect(preview.title).toContain("flowchart");
  });

  it("never opens any QuickPick or save dialog (slice 027/028 surface removed by T011)", async () => {
    const openMermaidPreview = vi.fn();
    const command = createExportMermaidCommand({
      getIndexer: async () => makeIndexerStub(2),
      openMermaidPreview,
    });

    await command();

    // The hoisted vscode mock no longer wires showQuickPick / showSaveDialog —
    // if exportMermaid.ts tried to call either, the import would throw at
    // module load. This test asserts that the new command does not rely on
    // those surfaces.
    // The presence of one openMermaidPreview call is the positive signal.
    expect(openMermaidPreview).toHaveBeenCalledTimes(1);
  });
});
