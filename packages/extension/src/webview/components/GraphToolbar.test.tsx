import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GraphToolbar } from "./GraphToolbar.js";

function renderToolbar(overrides?: Partial<ComponentProps<typeof GraphToolbar>>) {
  const onExportMermaid = vi.fn();
  const onToggleMinimap = vi.fn();
  const onToggleEdgeKind = vi.fn();

  const result = render(
    <GraphToolbar
      onExportMermaid={onExportMermaid}
      showMinimap={false}
      onToggleMinimap={onToggleMinimap}
      edgeKinds={["DEFINES", "CALLS", "IMPORTS"]}
      hiddenEdgeKinds={new Set()}
      onToggleEdgeKind={onToggleEdgeKind}
      {...overrides}
    />,
  );

  return { ...result, onExportMermaid, onToggleMinimap, onToggleEdgeKind };
}

describe("GraphToolbar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders without throwing", () => {
    renderToolbar();

    expect(screen.getByRole("toolbar", { name: "Graph toolbar" })).toBeTruthy();
  });

  it("calls onExportMermaid when the export button is clicked", () => {
    const { onExportMermaid } = renderToolbar();

    fireEvent.click(screen.getByRole("button", { name: "Export as Mermaid" }));

    expect(onExportMermaid).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleMinimap when the minimap toggle button is clicked", () => {
    const { onToggleMinimap } = renderToolbar();

    fireEvent.click(screen.getByRole("button", { name: "Toggle minimap" }));

    expect(onToggleMinimap).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleEdgeKind with the clicked edge kind", () => {
    const { onToggleEdgeKind } = renderToolbar();

    fireEvent.click(screen.getByRole("button", { name: "Hide Defines edges" }));

    expect(onToggleEdgeKind).toHaveBeenCalledWith("DEFINES");
  });

  it("exposes aria-labels for all toolbar buttons", () => {
    renderToolbar();

    expect(screen.getByRole("button", { name: "Export as Mermaid" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Toggle minimap" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide Defines edges" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide Calls edges" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide Imports edges" })).toBeTruthy();
  });

  it("reflects the minimap visibility state with aria-pressed", () => {
    const { rerender } = renderToolbar();
    const toggleButton = screen.getByRole("button", { name: "Toggle minimap" });

    expect(toggleButton.getAttribute("aria-pressed")).toBe("false");

    rerender(
      <GraphToolbar
        onExportMermaid={vi.fn()}
        showMinimap={true}
        onToggleMinimap={vi.fn()}
        edgeKinds={["DEFINES", "CALLS", "IMPORTS"]}
        hiddenEdgeKinds={new Set()}
        onToggleEdgeKind={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Toggle minimap" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("renders in isolation with mocked props", () => {
    const { container } = renderToolbar();

    expect(container.querySelector(".dxt-toolbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export as Mermaid" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Toggle minimap" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide Defines edges" })).toBeTruthy();
  });

  it("renders without errors when edgeKinds is empty", () => {
    const { container } = renderToolbar({ edgeKinds: [] });

    expect(container.querySelector(".dxt-toolbar")).toBeTruthy();
    expect(container.querySelector(".dxt-edge-filter-pill")).toBeNull();
  });
});
