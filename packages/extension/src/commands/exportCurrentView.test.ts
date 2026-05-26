import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  window: {
    showInformationMessage: vi.fn(),
  },
}));

import * as vscode from "vscode";
import { createExportCurrentViewCommand, createExportTraceCommand } from "./exportCurrentView.js";

describe("createExportCurrentViewCommand", () => {
  it("returns a function", () => {
    const cmd = createExportCurrentViewCommand({
      exportInferred: vi.fn().mockResolvedValue(undefined),
    });
    expect(typeof cmd).toBe("function");
  });

  it("shows a fail-closed message when called without viewId", async () => {
    const cmd = createExportCurrentViewCommand({
      exportInferred: vi.fn().mockResolvedValue(undefined),
    });
    await cmd();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("requires an active graph view"),
    );
  });

  it("delegates to exportInferred when called with a viewId", async () => {
    const exportInferred = vi.fn().mockResolvedValue(undefined);
    const cmd = createExportCurrentViewCommand({ exportInferred });
    await cmd("v1");
    expect(exportInferred).toHaveBeenCalledTimes(1);
    expect(exportInferred).toHaveBeenCalledWith({
      intent: "current-view",
      context: { kind: "current-view", viewId: "v1" },
      scope: { kind: "workspace" },
      diagram: "flowchart",
      direction: "auto",
    });
  });
});

describe("createExportTraceCommand", () => {
  it("returns a function", () => {
    const cmd = createExportTraceCommand({
      exportInferred: vi.fn().mockResolvedValue(undefined),
    });
    expect(typeof cmd).toBe("function");
  });
});
