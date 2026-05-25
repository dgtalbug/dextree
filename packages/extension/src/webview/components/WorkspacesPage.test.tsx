import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IndexedWorkspaceRecord } from "../protocol/messages.js";
import { WorkspacesPage } from "./WorkspacesPage.js";

function makeRecord(overrides: Partial<IndexedWorkspaceRecord> = {}): IndexedWorkspaceRecord {
  return {
    workspaceRoot: "/workspace/dextree",
    name: "dextree",
    indexedFileCount: 42,
    graphNodeCount: 100,
    graphEdgeCount: 250,
    lastIndexedAt: "2026-05-25T10:30:00.000Z",
    frameworks: ["react"],
    isActive: false,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("WorkspacesPage", () => {
  it("renders a loading state when workspaces is null", () => {
    render(<WorkspacesPage workspaces={null} onBack={vi.fn()} onSwitch={vi.fn()} />);

    expect(screen.getByText(/Loading workspaces/)).toBeTruthy();
  });

  it("renders an empty-state message when workspaces is an empty array", () => {
    render(<WorkspacesPage workspaces={[]} onBack={vi.fn()} onSwitch={vi.fn()} />);

    expect(screen.getByText(/No workspaces indexed yet/)).toBeTruthy();
  });

  it("renders one card per entry", () => {
    const list = [
      makeRecord({ workspaceRoot: "/a", name: "a" }),
      makeRecord({ workspaceRoot: "/b", name: "b" }),
      makeRecord({ workspaceRoot: "/c", name: "c", isActive: true }),
    ];

    render(<WorkspacesPage workspaces={list} onBack={vi.fn()} onSwitch={vi.fn()} />);

    expect(screen.getAllByTestId("workspace-card").length).toBe(3);
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("invokes onBack when the back button is clicked", () => {
    const onBack = vi.fn();
    render(<WorkspacesPage workspaces={[]} onBack={onBack} onSwitch={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Back to graph" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("forwards onSwitch when a non-active card is clicked", () => {
    const onSwitch = vi.fn();
    const list = [
      makeRecord({ workspaceRoot: "/a", name: "a", isActive: true }),
      makeRecord({ workspaceRoot: "/b", name: "b" }),
    ];

    render(<WorkspacesPage workspaces={list} onBack={vi.fn()} onSwitch={onSwitch} />);

    const cards = screen.getAllByTestId("workspace-card");
    fireEvent.click(cards[1]!);

    expect(onSwitch).toHaveBeenCalledWith("/b");
  });
});
