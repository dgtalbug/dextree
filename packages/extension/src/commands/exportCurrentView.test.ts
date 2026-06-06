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

  it("exports the visible scope when the user picks 'current view'", async () => {
    const exportInferred = vi.fn().mockResolvedValue(undefined);
    const pickScope = vi.fn().mockResolvedValue("visible" as const);
    const cmd = createExportCurrentViewCommand({ exportInferred, pickScope });
    await cmd("v1", ["n1", "n2"], ["e1"]);
    expect(pickScope).toHaveBeenCalledWith(2);
    expect(exportInferred).toHaveBeenCalledWith({
      intent: "current-view",
      context: { kind: "current-view", viewId: "v1" },
      scope: { kind: "visible", nodeIds: ["n1", "n2"], edgeIds: ["e1"] },
      diagram: "flowchart",
      direction: "auto",
    });
  });

  it("exports the whole workspace when the user picks 'whole workspace'", async () => {
    const exportInferred = vi.fn().mockResolvedValue(undefined);
    const pickScope = vi.fn().mockResolvedValue("workspace" as const);
    const cmd = createExportCurrentViewCommand({ exportInferred, pickScope });
    await cmd("v1", ["n1", "n2"], ["e1"]);
    expect(exportInferred).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: "workspace" } }),
    );
  });

  it("does not export when the user dismisses the scope picker", async () => {
    const exportInferred = vi.fn().mockResolvedValue(undefined);
    const pickScope = vi.fn().mockResolvedValue("cancel" as const);
    const cmd = createExportCurrentViewCommand({ exportInferred, pickScope });
    await cmd("v1", ["n1"], []);
    expect(exportInferred).not.toHaveBeenCalled();
  });

  it("skips the picker and exports the whole workspace when the view is empty", async () => {
    const exportInferred = vi.fn().mockResolvedValue(undefined);
    const pickScope = vi.fn();
    const cmd = createExportCurrentViewCommand({ exportInferred, pickScope });
    await cmd("v1", [], []);
    expect(pickScope).not.toHaveBeenCalled();
    expect(exportInferred).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: "workspace" } }),
    );
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
