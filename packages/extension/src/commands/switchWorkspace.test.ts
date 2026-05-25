/**
 * Tests for `createSwitchWorkspaceCommand` (slice 024 US3).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSwitchWorkspaceCommand } from "./switchWorkspace.js";

const showQuickPick = vi.fn();
const showErrorMessage = vi.fn();
const showInformationMessage = vi.fn();

vi.mock("vscode", () => ({
  window: {
    showQuickPick: (...args: unknown[]) => showQuickPick(...args),
    showErrorMessage: (...args: unknown[]) => showErrorMessage(...args),
    showInformationMessage: (...args: unknown[]) => showInformationMessage(...args),
  },
}));

const listIndexedWorkspaces = vi.fn();

vi.mock("../cache/workspaceRegistry.js", () => ({
  listIndexedWorkspaces: (...args: unknown[]) => listIndexedWorkspaces(...args),
}));

beforeEach(() => {
  showQuickPick.mockReset();
  showErrorMessage.mockReset();
  showInformationMessage.mockReset();
  listIndexedWorkspaces.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createSwitchWorkspaceCommand", () => {
  it("shows an error notification when globalStoragePath is unavailable", async () => {
    const switchWorkspace = vi.fn();
    const handler = createSwitchWorkspaceCommand({
      getGlobalStoragePath: () => undefined,
      getActiveWorkspaceRoot: () => "/a",
      switchWorkspace,
    });

    await handler();

    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Global storage is unavailable/i),
    );
    expect(switchWorkspace).not.toHaveBeenCalled();
  });

  it("shows an info notification when no workspaces are indexed yet", async () => {
    listIndexedWorkspaces.mockResolvedValue([]);
    const switchWorkspace = vi.fn();
    const handler = createSwitchWorkspaceCommand({
      getGlobalStoragePath: () => "/global",
      getActiveWorkspaceRoot: () => "/a",
      switchWorkspace,
    });

    await handler();

    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringMatching(/No workspaces indexed yet/i),
    );
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(switchWorkspace).not.toHaveBeenCalled();
  });

  it("presents a quick-pick with one item per indexed workspace", async () => {
    listIndexedWorkspaces.mockResolvedValue([
      {
        workspaceRoot: "/a/dextree",
        name: "dextree",
        indexedFileCount: 1,
        graphNodeCount: 1,
        graphEdgeCount: 0,
        lastIndexedAt: null,
        frameworks: [],
        isActive: true,
      },
      {
        workspaceRoot: "/b/widgets",
        name: "widgets",
        indexedFileCount: 1,
        graphNodeCount: 1,
        graphEdgeCount: 0,
        lastIndexedAt: null,
        frameworks: [],
        isActive: false,
      },
    ]);
    showQuickPick.mockResolvedValue(undefined);
    const handler = createSwitchWorkspaceCommand({
      getGlobalStoragePath: () => "/global",
      getActiveWorkspaceRoot: () => "/a/dextree",
      switchWorkspace: vi.fn(),
    });

    await handler();

    const items = showQuickPick.mock.calls[0]?.[0] as Array<{
      label: string;
      workspaceRoot: string;
      isActive: boolean;
    }>;
    expect(items.length).toBe(2);
    expect(items[0]?.label).toBe("dextree");
    expect(items[0]?.isActive).toBe(true);
    expect(items[1]?.label).toBe("widgets");
    expect(items[1]?.isActive).toBe(false);
  });

  it("invokes switchWorkspace with the picked workspaceRoot", async () => {
    listIndexedWorkspaces.mockResolvedValue([
      {
        workspaceRoot: "/b/widgets",
        name: "widgets",
        indexedFileCount: 1,
        graphNodeCount: 1,
        graphEdgeCount: 0,
        lastIndexedAt: null,
        frameworks: [],
        isActive: false,
      },
    ]);
    showQuickPick.mockResolvedValue({
      label: "widgets",
      workspaceRoot: "/b/widgets",
      isActive: false,
    });
    const switchWorkspace = vi.fn().mockResolvedValue(undefined);
    const handler = createSwitchWorkspaceCommand({
      getGlobalStoragePath: () => "/global",
      getActiveWorkspaceRoot: () => "/a/dextree",
      switchWorkspace,
    });

    await handler();

    expect(switchWorkspace).toHaveBeenCalledWith("/b/widgets");
  });

  it("is a no-op when the user picks the currently active workspace", async () => {
    listIndexedWorkspaces.mockResolvedValue([
      {
        workspaceRoot: "/a/dextree",
        name: "dextree",
        indexedFileCount: 1,
        graphNodeCount: 1,
        graphEdgeCount: 0,
        lastIndexedAt: null,
        frameworks: [],
        isActive: true,
      },
    ]);
    showQuickPick.mockResolvedValue({
      label: "dextree",
      workspaceRoot: "/a/dextree",
      isActive: true,
    });
    const switchWorkspace = vi.fn();
    const handler = createSwitchWorkspaceCommand({
      getGlobalStoragePath: () => "/global",
      getActiveWorkspaceRoot: () => "/a/dextree",
      switchWorkspace,
    });

    await handler();

    expect(switchWorkspace).not.toHaveBeenCalled();
  });

  it("is a no-op when the quick-pick is cancelled", async () => {
    listIndexedWorkspaces.mockResolvedValue([
      {
        workspaceRoot: "/b/widgets",
        name: "widgets",
        indexedFileCount: 1,
        graphNodeCount: 1,
        graphEdgeCount: 0,
        lastIndexedAt: null,
        frameworks: [],
        isActive: false,
      },
    ]);
    showQuickPick.mockResolvedValue(undefined);
    const switchWorkspace = vi.fn();
    const handler = createSwitchWorkspaceCommand({
      getGlobalStoragePath: () => "/global",
      getActiveWorkspaceRoot: () => "/a/dextree",
      switchWorkspace,
    });

    await handler();

    expect(switchWorkspace).not.toHaveBeenCalled();
  });
});
