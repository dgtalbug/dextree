import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IndexedWorkspaceRecord } from "../protocol/messages.js";
import { WorkspaceCard } from "./WorkspaceCard.js";

function makeRecord(overrides: Partial<IndexedWorkspaceRecord> = {}): IndexedWorkspaceRecord {
  return {
    workspaceRoot: "/workspace/dextree",
    name: "dextree",
    indexedFileCount: 42,
    graphNodeCount: 100,
    graphEdgeCount: 250,
    lastIndexedAt: "2026-05-25T10:30:00.000Z",
    frameworks: ["react", "vitest"],
    isActive: false,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("WorkspaceCard", () => {
  it("renders the workspace name, path, and stats", () => {
    const onSwitch = vi.fn();
    const { container } = render(<WorkspaceCard workspace={makeRecord()} onSwitch={onSwitch} />);

    expect(screen.getByText("dextree")).toBeTruthy();
    expect(screen.getByText("/workspace/dextree")).toBeTruthy();
    expect(container.textContent).toContain("42");
    expect(container.textContent).toContain("100");
    expect(container.textContent).toContain("250");
  });

  it("renders framework chips when frameworks are present", () => {
    const { container } = render(<WorkspaceCard workspace={makeRecord()} onSwitch={vi.fn()} />);

    const chips = container.querySelectorAll(".dxt-badge--framework");
    expect(chips.length).toBe(2);
    expect(chips[0]?.textContent).toBe("react");
    expect(chips[1]?.textContent).toBe("vitest");
  });

  it("omits the chip row when frameworks is empty", () => {
    const { container } = render(
      <WorkspaceCard workspace={makeRecord({ frameworks: [] })} onSwitch={vi.fn()} />,
    );

    expect(container.querySelectorAll(".dxt-badge--framework").length).toBe(0);
  });

  it("renders an Active pill and prevents click when isActive", () => {
    const onSwitch = vi.fn();
    render(<WorkspaceCard workspace={makeRecord({ isActive: true })} onSwitch={onSwitch} />);

    expect(screen.getByText("Active")).toBeTruthy();
    fireEvent.click(screen.getByTestId("workspace-card"));
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("calls onSwitch with workspaceRoot when clicked on non-active card", () => {
    const onSwitch = vi.fn();
    render(<WorkspaceCard workspace={makeRecord()} onSwitch={onSwitch} />);

    fireEvent.click(screen.getByTestId("workspace-card"));

    expect(onSwitch).toHaveBeenCalledWith("/workspace/dextree");
  });

  it("activates on Enter keypress (keyboard accessibility)", () => {
    const onSwitch = vi.fn();
    render(<WorkspaceCard workspace={makeRecord()} onSwitch={onSwitch} />);

    fireEvent.keyDown(screen.getByTestId("workspace-card"), { key: "Enter" });

    expect(onSwitch).toHaveBeenCalledWith("/workspace/dextree");
  });

  it("renders the formatted last-indexed timestamp", () => {
    const { container } = render(<WorkspaceCard workspace={makeRecord()} onSwitch={vi.fn()} />);

    expect(container.textContent).toContain("Last indexed:");
  });

  it("shows 'Never indexed' when lastIndexedAt is null", () => {
    render(<WorkspaceCard workspace={makeRecord({ lastIndexedAt: null })} onSwitch={vi.fn()} />);

    expect(screen.getByText(/Never indexed/)).toBeTruthy();
  });

  // Slice 033 Phase 6 — active treatment + architecture strip.
  describe("active treatment (T034)", () => {
    it("marks the active card with aria-current and a green Active pill", () => {
      render(<WorkspaceCard workspace={makeRecord({ isActive: true })} onSwitch={vi.fn()} />);

      const card = screen.getByTestId("workspace-card");
      expect(card.getAttribute("aria-current")).toBe("true");
      const pill = screen.getByText("Active");
      expect(pill).toBeTruthy();
      // The Active pill carries the dedicated (green) pill class, not a bare badge.
      expect(pill.className).toMatch(/activePill/);
    });

    it("does not render an Active pill or aria-current on non-active cards", () => {
      render(<WorkspaceCard workspace={makeRecord({ isActive: false })} onSwitch={vi.fn()} />);

      expect(screen.queryByText("Active")).toBeNull();
      expect(screen.getByTestId("workspace-card").getAttribute("aria-current")).toBeNull();
    });
  });

  describe("architecture strip (T038)", () => {
    it("renders an architecture strip", () => {
      render(<WorkspaceCard workspace={makeRecord()} onSwitch={vi.fn()} />);
      expect(screen.getByTestId("workspace-arch-strip")).toBeTruthy();
    });

    it("shows the gray placeholder strip with a re-index tooltip when no layer data is available", () => {
      // IndexedWorkspaceRecord carries no per-layer breakdown yet, so the strip
      // is a single gray placeholder segment (T038) rather than fabricated bands.
      render(<WorkspaceCard workspace={makeRecord()} onSwitch={vi.fn()} />);
      const strip = screen.getByTestId("workspace-arch-strip");
      expect(strip.getAttribute("title")).toMatch(/re-index with classification/i);
    });
  });
});
