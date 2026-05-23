import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionSummary } from "@dextree/core";

const {
  mockShowInformationMessage,
  mockShowErrorMessage,
  mockShowTextDocument,
  mockSetStatusBarMessage,
  mockWriteFile,
} = vi.hoisted(() => ({
  mockShowInformationMessage: vi.fn(),
  mockShowErrorMessage: vi.fn(),
  mockShowTextDocument: vi.fn(),
  mockSetStatusBarMessage: vi.fn(),
  mockWriteFile: vi.fn(),
}));

vi.mock("vscode", () => ({
  window: {
    showInformationMessage: mockShowInformationMessage,
    showErrorMessage: mockShowErrorMessage,
    showTextDocument: mockShowTextDocument,
    setStatusBarMessage: mockSetStatusBarMessage,
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace/proj" } }],
    fs: {
      writeFile: mockWriteFile,
    },
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => p }),
  },
}));

// EmptyGraphError is a class  import after vi.mockvalue
import { EmptyGraphError } from "@dextree/core";

import {
  createExportSessionSummaryCommand,
  resetExportingStateForTests,
} from "./exportSessionSummary.js";

const SUMMARY: SessionSummary = {
  workspaceName: "proj",
  generatedAt: new Date("2026-05-23T08:00:00.000Z"),
  fileCount: 3,
  symbolCount: 10,
  topFiles: [{ path: "src/index.ts", symbolCount: 7 }],
  edgeKindCounts: [{ kind: "CALLS", count: 4 }],
};

function makeIndexer(overrides: { getSessionSummary?: () => Promise<SessionSummary> } = {}) {
  return {
    getSessionSummary: overrides.getSessionSummary ?? vi.fn().mockResolvedValue(SUMMARY),
  };
}

describe("createExportSessionSummaryCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetExportingStateForTests();
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetExportingStateForTests();
  });

  it("shows information notification and does not write when graph is empty", async () => {
    const indexer = makeIndexer({
      getSessionSummary: vi.fn().mockRejectedValue(new EmptyGraphError()),
    });
    const cmd = createExportSessionSummaryCommand({ getIndexer: async () => indexer as never });

    await cmd();

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Index your workspace"),
    );
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("does not open editor when graph is empty", async () => {
    const indexer = makeIndexer({
      getSessionSummary: vi.fn().mockRejectedValue(new EmptyGraphError()),
    });
    const cmd = createExportSessionSummaryCommand({ getIndexer: async () => indexer as never });

    await cmd();

    expect(mockShowTextDocument).not.toHaveBeenCalled();
  });

  it("shows error notification when write fails", async () => {
    mockWriteFile.mockRejectedValue(new Error("EACCES: permission denied"));
    const indexer = makeIndexer();
    const cmd = createExportSessionSummaryCommand({ getIndexer: async () => indexer as never });

    await cmd();

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("EACCES"));
  });

  it("does not open editor when write fails", async () => {
    mockWriteFile.mockRejectedValue(new Error("disk full"));
    const indexer = makeIndexer();
    const cmd = createExportSessionSummaryCommand({ getIndexer: async () => indexer as never });

    await cmd();

    expect(mockShowTextDocument).not.toHaveBeenCalled();
  });

  it("ignores second invocation while export is in progress and shows status bar message", async () => {
    let resolveFirst!: () => void;
    const firstWritePromise = new Promise<void>((res) => {
      resolveFirst = res;
    });
    mockWriteFile.mockReturnValueOnce(firstWritePromise);

    const indexer = makeIndexer();
    const cmd = createExportSessionSummaryCommand({ getIndexer: async () => indexer as never });

    const first = cmd();
    await cmd();

    expect(mockSetStatusBarMessage).toHaveBeenCalledWith(
      expect.stringContaining("already in progress"),
      expect.any(Number),
    );

    resolveFirst();
    await first;
  });

  it("writes Markdown file to workspace root on success", async () => {
    const indexer = makeIndexer();
    const cmd = createExportSessionSummaryCommand({ getIndexer: async () => indexer as never });

    await cmd();

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [uri, content] = mockWriteFile.mock.calls[0] as [{ fsPath: string }, Uint8Array];
    expect(uri.fsPath).toContain("dextree-summary.md");
    const text = new TextDecoder().decode(content);
    expect(text).toContain("proj");
    expect(text).toContain("3");
    expect(text).toContain("10");
    expect(text).toContain("CALLS");
  });

  it("opens the exported file in the editor on success", async () => {
    const indexer = makeIndexer();
    const cmd = createExportSessionSummaryCommand({ getIndexer: async () => indexer as never });

    await cmd();

    expect(mockShowTextDocument).toHaveBeenCalledTimes(1);
  });

  it("allows a second export after the first succeeds", async () => {
    const indexer = makeIndexer();
    const cmd = createExportSessionSummaryCommand({ getIndexer: async () => indexer as never });

    await cmd();
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    await cmd();

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });
});
