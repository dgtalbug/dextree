import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GraphToolbar } from "./GraphToolbar.js";
import { CANONICAL_NODE_FILTER_LIST } from "./NodeFilterPanel.js";

function renderToolbar(overrides?: Partial<ComponentProps<typeof GraphToolbar>>) {
  const onExportMermaid = vi.fn();
  const onToggleMinimap = vi.fn();
  const onToggleEdgeKind = vi.fn();
  const onToggleNodeKind = vi.fn();
  const onSearchQueryChange = vi.fn();
  const onSearchSelectResult = vi.fn();
  const onSearchClear = vi.fn();
  const onDepthChange = vi.fn();

  const result = render(
    <GraphToolbar
      onExportMermaid={onExportMermaid}
      showMinimap={false}
      onToggleMinimap={onToggleMinimap}
      edgeKinds={["DEFINES", "CALLS", "IMPORTS"]}
      hiddenEdgeKinds={new Set()}
      onToggleEdgeKind={onToggleEdgeKind}
      nodeFilterEntries={CANONICAL_NODE_FILTER_LIST.map((t, i) => ({
        ...t,
        count: i,
      }))}
      hiddenNodeKinds={new Set()}
      onToggleNodeKind={onToggleNodeKind}
      searchQuery=""
      searchResults={[]}
      searchFocusedIndex={0}
      onSearchQueryChange={onSearchQueryChange}
      onSearchSelectResult={onSearchSelectResult}
      onSearchClear={onSearchClear}
      depth={3}
      depthEnabled={false}
      onDepthChange={onDepthChange}
      {...overrides}
    />,
  );

  return {
    ...result,
    onExportMermaid,
    onToggleMinimap,
    onToggleEdgeKind,
    onToggleNodeKind,
    onSearchQueryChange,
    onSearchSelectResult,
    onSearchClear,
    onDepthChange,
  };
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
        nodeFilterEntries={CANONICAL_NODE_FILTER_LIST.map((t, i) => ({ ...t, count: i }))}
        hiddenNodeKinds={new Set()}
        onToggleNodeKind={vi.fn()}
        searchQuery=""
        searchResults={[]}
        searchFocusedIndex={0}
        onSearchQueryChange={vi.fn()}
        onSearchSelectResult={vi.fn()}
        onSearchClear={vi.fn()}
        depth={3}
        depthEnabled={false}
        onDepthChange={vi.fn()}
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
    // Implements stub is always rendered even when edgeKinds is empty
    expect(container.querySelectorAll(".dxt-edge-filter-pill").length).toBe(1);
  });

  // US2: Edge-type rename + Implements stub
  it("renders INHERITS edge pill with label 'Extends' (FR-006)", () => {
    renderToolbar({ edgeKinds: ["INHERITS"] });

    expect(screen.getByRole("button", { name: "Hide Extends edges" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Inherits/i })).toBeNull();
  });

  it("clicking Extends pill calls onToggleEdgeKind with 'INHERITS'", () => {
    const { onToggleEdgeKind } = renderToolbar({ edgeKinds: ["INHERITS"] });

    fireEvent.click(screen.getByRole("button", { name: "Hide Extends edges" }));

    expect(onToggleEdgeKind).toHaveBeenCalledWith("INHERITS");
  });

  it("renders disabled Implements stub with aria-disabled=true (FR-007)", () => {
    renderToolbar({ edgeKinds: [] });

    const implementsButton = screen.getByTitle(
      "Available when ImplementsExtractor ships (slice 031)",
    );
    expect(implementsButton.getAttribute("aria-disabled")).toBe("true");
  });

  it("clicking Implements stub does NOT call onToggleEdgeKind", () => {
    const { onToggleEdgeKind } = renderToolbar({ edgeKinds: [] });

    const implementsButton = screen.getByTitle(
      "Available when ImplementsExtractor ships (slice 031)",
    );
    fireEvent.click(implementsButton);

    expect(onToggleEdgeKind).not.toHaveBeenCalled();
  });

  it("renders Implements stub even when edgeKinds has all 5 fixed kinds (FR-005)", () => {
    renderToolbar({ edgeKinds: ["DEFINES", "IMPORTS", "CALLS", "INHERITS", "INSTANTIATES"] });

    expect(screen.getByTitle("Available when ImplementsExtractor ships (slice 031)")).toBeTruthy();
  });

  it("renders all 5 fixed edge pills even when edgeKinds list is full", () => {
    renderToolbar({ edgeKinds: ["DEFINES", "IMPORTS", "CALLS", "INHERITS", "INSTANTIATES"] });

    expect(screen.getByRole("button", { name: "Hide Defines edges" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide Imports edges" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide Calls edges" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide Extends edges" })).toBeTruthy();
  });

  it("renders node filter panel inside the toolbar", () => {
    renderToolbar();

    expect(screen.getByRole("group", { name: "Node type filters" })).toBeTruthy();
  });

  // Slice 022 — search + depth slider
  it("renders the search input inside the toolbar (slice 022)", () => {
    renderToolbar();

    expect(screen.getByRole("combobox", { name: "Search graph" })).toBeTruthy();
  });

  it("renders the depth slider inside the toolbar with the provided depth value", () => {
    renderToolbar({ depth: 4, depthEnabled: true });

    expect(screen.getByRole("slider", { name: "Hop depth" })).toBeTruthy();
    expect(screen.getByText("Depth: 4")).toBeTruthy();
  });

  it("disables the depth slider when depthEnabled is false", () => {
    renderToolbar({ depth: 3, depthEnabled: false });

    const slider = screen.getByRole("slider", { name: "Hop depth" }) as HTMLInputElement;
    expect(slider.disabled).toBe(true);
  });
});
