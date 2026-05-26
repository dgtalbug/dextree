import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  window: {
    showInformationMessage: vi.fn(),
  },
}));

import { createExportCurrentViewCommand, createExportTraceCommand } from "./exportCurrentView.js";

describe("createExportCurrentViewCommand", () => {
  it("returns a function", () => {
    const cmd = createExportCurrentViewCommand({
      exportInferred: vi.fn().mockResolvedValue(undefined),
    });
    expect(typeof cmd).toBe("function");
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
