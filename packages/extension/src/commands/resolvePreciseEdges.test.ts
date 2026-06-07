import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Indexer, PreciseResolutionSummary } from "@dextree/core";

const { mockShowInformationMessage, mockWithProgress } = vi.hoisted(() => ({
  mockShowInformationMessage: vi.fn(),
  mockWithProgress: vi.fn(),
}));

vi.mock("vscode", () => ({
  window: {
    showInformationMessage: mockShowInformationMessage,
    withProgress: mockWithProgress,
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace/proj" }, name: "proj" }],
  },
  ProgressLocation: { Notification: 15 },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

// LspCallResolver imports vscode; the mock above satisfies it. The mock indexer
// never invokes the resolver, so its behavior is irrelevant to these tests.
import { createResolvePreciseEdgesCommand } from "./resolvePreciseEdges.js";

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), dispose: vi.fn() };
}

/** Run the withProgress callback immediately with a fake progress + token. */
function runProgressInline(cancelled = false) {
  mockWithProgress.mockImplementation(
    async (_opts: unknown, task: (p: unknown, t: unknown) => Promise<unknown>) =>
      task({ report: vi.fn() }, { isCancellationRequested: cancelled }),
  );
}

function makeIndexer(summary: PreciseResolutionSummary): Indexer {
  return {
    resolvePreciseEdges: vi.fn().mockResolvedValue(summary),
  } as unknown as Indexer;
}

beforeEach(() => {
  mockShowInformationMessage.mockReset();
  mockWithProgress.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createResolvePreciseEdgesCommand", () => {
  it("runs the indexer pass and reports the upgrade count", async () => {
    runProgressInline();
    const indexer = makeIndexer({ total: 12, upgraded: 9, cancelled: false });
    const onResolved = vi.fn();
    const command = createResolvePreciseEdgesCommand({
      logger: makeLogger(),
      getIndexer: async () => indexer,
      onResolved,
    });

    await command();

    expect(indexer.resolvePreciseEdges).toHaveBeenCalledWith(
      "/workspace/proj",
      expect.anything(),
      expect.objectContaining({ isCancelled: expect.any(Function) }),
    );
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("upgraded 9 of 12"),
    );
  });

  it("reports the empty case without refreshing", async () => {
    runProgressInline();
    const indexer = makeIndexer({ total: 0, upgraded: 0, cancelled: false });
    const onResolved = vi.fn();
    await createResolvePreciseEdgesCommand({
      logger: makeLogger(),
      getIndexer: async () => indexer,
      onResolved,
    })();

    expect(onResolved).not.toHaveBeenCalled();
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("no unresolved call edges"),
    );
  });

  it("surfaces cancellation in the message", async () => {
    runProgressInline(true);
    const indexer = makeIndexer({ total: 10, upgraded: 4, cancelled: true });
    await createResolvePreciseEdgesCommand({
      logger: makeLogger(),
      getIndexer: async () => indexer,
    })();

    expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining("cancelled"));
  });
});
