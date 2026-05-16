import { beforeEach, describe, expect, it, vi } from "vitest";

const createOutputChannel = vi.fn(() => ({
  appendLine: vi.fn(),
  dispose: vi.fn(),
}));
const registerCommand = vi.fn((_command, handler) => ({
  dispose: vi.fn(),
  handler,
}));

vi.mock("vscode", () => ({
  window: {
    createOutputChannel,
  },
  commands: {
    registerCommand,
  },
}));

describe("activate", () => {
  beforeEach(() => {
    createOutputChannel.mockClear();
    registerCommand.mockClear();
  });

  it("registers the index file command and output channel", async () => {
    const extension = await import("./extension.js");
    const subscriptions: { dispose(): void }[] = [];

    await extension.activate({
      subscriptions,
      storageUri: { fsPath: "/workspace/.storage" },
      extensionUri: { fsPath: "/workspace/packages/extension" },
    });

    expect(createOutputChannel).toHaveBeenCalledWith("Dextree");
    expect(registerCommand).toHaveBeenCalledWith("dextree.indexFile", expect.any(Function));
    expect(subscriptions.length).toBeGreaterThan(0);
  });
});
