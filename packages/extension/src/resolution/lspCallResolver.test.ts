import { beforeEach, describe, expect, it, vi } from "vitest";

const executeCommand = vi.fn();

vi.mock("vscode", () => ({
  Uri: { file: (p: string) => ({ fsPath: p }) },
  Position: class {
    constructor(
      public line: number,
      public character: number,
    ) {}
  },
  commands: { executeCommand: (...args: unknown[]) => executeCommand(...args) },
}));

const { LspCallResolver } = await import("./lspCallResolver.js");

function item(name: string, filePath: string, line: number) {
  return { name, uri: { fsPath: filePath }, range: { start: { line, character: 0 } } };
}

beforeEach(() => {
  executeCommand.mockReset();
});

describe("LspCallResolver", () => {
  it("maps incoming calls to precise caller edges", async () => {
    executeCommand.mockImplementation(async (cmd: string) => {
      if (cmd === "vscode.prepareCallHierarchy") return [item("target", "/w/a.ts", 10)];
      if (cmd === "vscode.provideIncomingCalls")
        return [{ from: item("caller", "/w/b.ts", 3), fromRanges: [] }];
      return undefined;
    });

    const edges = await new LspCallResolver().resolve(
      { filePath: "/w/a.ts", line: 10, column: 5 },
      "in",
    );

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ name: "caller", filePath: "/w/b.ts", tier: "precise" });
  });

  it("maps outgoing calls to precise callee edges", async () => {
    executeCommand.mockImplementation(async (cmd: string) => {
      if (cmd === "vscode.prepareCallHierarchy") return [item("source", "/w/a.ts", 1)];
      if (cmd === "vscode.provideOutgoingCalls")
        return [{ to: item("callee", "/w/c.ts", 7), fromRanges: [] }];
      return undefined;
    });

    const edges = await new LspCallResolver().resolve(
      { filePath: "/w/a.ts", line: 1, column: 0 },
      "out",
    );

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ name: "callee", filePath: "/w/c.ts", tier: "precise" });
  });

  it("degrades gracefully when no language server answers (empty prepare)", async () => {
    executeCommand.mockResolvedValue(undefined);
    const edges = await new LspCallResolver().resolve(
      { filePath: "/w/a.ts", line: 0, column: 0 },
      "in",
    );
    expect(edges).toEqual([]);
  });

  it("degrades gracefully when the server throws", async () => {
    executeCommand.mockRejectedValue(new Error("server not ready"));
    const edges = await new LspCallResolver().resolve(
      { filePath: "/w/a.ts", line: 0, column: 0 },
      "out",
    );
    expect(edges).toEqual([]);
  });
});
