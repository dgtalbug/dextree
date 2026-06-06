import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GraphToolbar } from "./GraphToolbar.js";

const baseProps = {
  onExportMermaid: vi.fn(),
  showMinimap: false,
  onToggleMinimap: vi.fn(),
  searchQuery: "",
  searchResults: [],
  searchFocusedIndex: 0,
  onSearchQueryChange: vi.fn(),
  onSearchSelectResult: vi.fn(),
  onSearchClear: vi.fn(),
  depth: 3,
  depthEnabled: false,
  onDepthChange: vi.fn(),
  tracePhase: "idle" as const,
  onTraceToggle: vi.fn(),
  onTraceExit: vi.fn(),
  activeLayoutPreset: "forceAtlas2" as const,
  onSelectLayoutPreset: vi.fn(),
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onZoomFit: vi.fn(),
  onZoomReset: vi.fn(),
} satisfies ComponentProps<typeof GraphToolbar>;

function renderToolbar(overrides?: Partial<ComponentProps<typeof GraphToolbar>>) {
  const onExportMermaid = vi.fn();
  const onToggleMinimap = vi.fn();
  const onSearchQueryChange = vi.fn();
  const onSearchSelectResult = vi.fn();
  const onSearchClear = vi.fn();
  const onDepthChange = vi.fn();
  const onTraceToggle = vi.fn();
  const onTraceExit = vi.fn();
  const onSelectLayoutPreset = vi.fn();
  const onZoomIn = vi.fn();
  const onZoomOut = vi.fn();
  const onZoomFit = vi.fn();
  const onZoomReset = vi.fn();

  const result = render(
    <GraphToolbar
      onExportMermaid={onExportMermaid}
      showMinimap={false}
      onToggleMinimap={onToggleMinimap}
      searchQuery=""
      searchResults={[]}
      searchFocusedIndex={0}
      onSearchQueryChange={onSearchQueryChange}
      onSearchSelectResult={onSearchSelectResult}
      onSearchClear={onSearchClear}
      depth={3}
      depthEnabled={false}
      onDepthChange={onDepthChange}
      tracePhase="idle"
      onTraceToggle={onTraceToggle}
      onTraceExit={onTraceExit}
      activeLayoutPreset="forceAtlas2"
      onSelectLayoutPreset={onSelectLayoutPreset}
      onZoomIn={onZoomIn}
      onZoomOut={onZoomOut}
      onZoomFit={onZoomFit}
      onZoomReset={onZoomReset}
      {...overrides}
    />,
  );

  return {
    ...result,
    onExportMermaid,
    onToggleMinimap,
    onSearchQueryChange,
    onSearchSelectResult,
    onSearchClear,
    onDepthChange,
    onTraceToggle,
    onTraceExit,
    onSelectLayoutPreset,
    onZoomIn,
    onZoomOut,
    onZoomFit,
    onZoomReset,
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

    fireEvent.click(screen.getByRole("button", { name: "Export to Mermaid" }));

    expect(onExportMermaid).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleMinimap when the minimap toggle button is clicked", () => {
    const { onToggleMinimap } = renderToolbar();

    fireEvent.click(screen.getByRole("button", { name: "Toggle minimap" }));

    expect(onToggleMinimap).toHaveBeenCalledTimes(1);
  });

  it("reflects the minimap visibility state with aria-pressed", () => {
    const { rerender } = renderToolbar();
    const toggleButton = screen.getByRole("button", { name: "Toggle minimap" });

    expect(toggleButton.getAttribute("aria-pressed")).toBe("false");

    rerender(<GraphToolbar {...baseProps} showMinimap={true} />);

    expect(
      screen.getByRole("button", { name: "Toggle minimap" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

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

  it("renders zoom buttons", () => {
    renderToolbar();

    expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fit to screen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset layout" })).toBeTruthy();
  });

  it("calls zoom handlers", () => {
    const { onZoomIn, onZoomOut, onZoomFit, onZoomReset } = renderToolbar();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(onZoomIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(onZoomOut).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Fit to screen" }));
    expect(onZoomFit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
    expect(onZoomReset).toHaveBeenCalledTimes(1);
  });

  // Slice 023 — trace route toggle
  it("renders the trace toggle button with aria-pressed reflecting the phase (slice 023)", () => {
    const { rerender } = renderToolbar({ tracePhase: "idle" });
    expect(
      screen.getByRole("button", { name: "Toggle trace route mode" }).getAttribute("aria-pressed"),
    ).toBe("false");

    rerender(<GraphToolbar {...baseProps} tracePhase="picking-start" />);
    expect(
      screen.getByRole("button", { name: "Toggle trace route mode" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("calls onTraceToggle when the trace button is clicked", () => {
    const { onTraceToggle } = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Toggle trace route mode" }));
    expect(onTraceToggle).toHaveBeenCalledTimes(1);
  });

  it("shows Export + Exit trace buttons only when tracePhase is not idle", () => {
    const { rerender } = renderToolbar({ tracePhase: "idle" });
    expect(screen.queryByRole("button", { name: "Exit trace mode" })).toBeNull();

    rerender(<GraphToolbar {...baseProps} tracePhase="picking-end" />);
    expect(screen.getByRole("button", { name: "Exit trace mode" })).toBeTruthy();
  });

  it("calls onTraceExit when the Exit trace button is clicked", () => {
    const { onTraceExit } = renderToolbar({ tracePhase: "path-active" });
    fireEvent.click(screen.getByRole("button", { name: "Exit trace mode" }));
    expect(onTraceExit).toHaveBeenCalledTimes(1);
  });

  it("activates the trace export button when canExportTrace is true (slice 031 US1)", () => {
    const onExportTrace = vi.fn();
    renderToolbar({
      tracePhase: "path-active",
      canExportTrace: true,
      onExportTrace,
    });

    const exportBtn = screen.getByRole("button", {
      name: "Export this trace as a sequence diagram",
    });
    expect((exportBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(exportBtn);
    expect(onExportTrace).toHaveBeenCalledTimes(1);
  });

  it("renders the workspace switcher button when workspaceName is provided", () => {
    renderToolbar({ workspaceName: "dextree" });

    const button = screen.getByRole("button", { name: /switch workspace/i });
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("dextree");
  });

  it("does not render the workspace switcher button when workspaceName is undefined", () => {
    renderToolbar();

    expect(screen.queryByRole("button", { name: /switch workspace/i })).toBeNull();
  });

  it("calls onWorkspaceSwitcherClick when the workspace button is clicked", () => {
    const onWorkspaceSwitcherClick = vi.fn();
    renderToolbar({ workspaceName: "dextree", onWorkspaceSwitcherClick });

    fireEvent.click(screen.getByRole("button", { name: /switch workspace/i }));

    expect(onWorkspaceSwitcherClick).toHaveBeenCalledTimes(1);
  });

  // Slice 025 — layout preset dropdown
  it("renders the layout dropdown showing the active preset (FR-001, FR-004)", () => {
    renderToolbar({ activeLayoutPreset: "forceAtlas2" });

    const dropdown = screen.getByRole("combobox", { name: /layout/i }) as HTMLSelectElement;
    expect(dropdown).toBeTruthy();
    expect(dropdown.value).toBe("forceAtlas2");
  });

  it("exposes exactly three preset options in spec order (FR-002)", () => {
    renderToolbar();

    const dropdown = screen.getByRole("combobox", { name: /layout/i }) as HTMLSelectElement;
    const ids = Array.from(dropdown.options).map((o) => o.value);
    expect(ids).toEqual(["forceAtlas2", "circular", "hierarchical"]);
  });

  it("reflects the active preset when re-rendered with a different value (FR-004)", () => {
    const { rerender } = renderToolbar({ activeLayoutPreset: "forceAtlas2" });
    expect((screen.getByRole("combobox", { name: /layout/i }) as HTMLSelectElement).value).toBe(
      "forceAtlas2",
    );

    rerender(<GraphToolbar {...baseProps} activeLayoutPreset="circular" />);
    expect((screen.getByRole("combobox", { name: /layout/i }) as HTMLSelectElement).value).toBe(
      "circular",
    );
  });

  it("calls onSelectLayoutPreset with the chosen preset id when changed", () => {
    const { onSelectLayoutPreset } = renderToolbar({ activeLayoutPreset: "forceAtlas2" });

    fireEvent.change(screen.getByRole("combobox", { name: /layout/i }), {
      target: { value: "circular" },
    });

    expect(onSelectLayoutPreset).toHaveBeenCalledWith("circular");
  });

  // Slice 033 US3 — toolbar groups
  describe("toolbar groups (slice 033 US3)", () => {
    it("renders toolbar controls organized into distinct groups", () => {
      const { container } = renderToolbar({ workspaceName: "dextree" });

      const groups = container.querySelectorAll('[data-testid="toolbar-group"]');
      expect(groups.length).toBeGreaterThanOrEqual(7);
    });

    it("orders groups in mockup sequence: workspace → search → zoom → depth → trace → layout → view", () => {
      const { container } = renderToolbar({ workspaceName: "dextree" });

      const groups = Array.from(container.querySelectorAll('[data-testid="toolbar-group"]'));
      const labels = groups.map((g) => g.getAttribute("aria-label"));

      expect(labels).toEqual([
        "Workspace switcher",
        "Search",
        "Zoom controls",
        "Depth controls",
        "Trace controls",
        "Layout controls",
        "View controls",
      ]);
    });

    it("renders export button as accent-styled in the view controls group", () => {
      const { container } = renderToolbar();

      const viewGroup = container.querySelector(
        '[data-testid="toolbar-group"][aria-label="View controls"]',
      );
      expect(viewGroup).toBeTruthy();
      const exportBtn = viewGroup?.querySelector('[data-testid="export-accent"]');
      expect(exportBtn).toBeTruthy();
    });
  });

  // Slice 033 Phase 3 — workspace actions relocated from the legacy right panel.
  describe("workspace actions group (slice 033 Phase 3)", () => {
    it("renders Re-index, Source-only, Clear Workspace, and Clear All when handlers are provided", () => {
      renderToolbar({
        onReindex: vi.fn(),
        onClearWorkspace: vi.fn(),
        onClearAll: vi.fn(),
        onToggleSourceOnly: vi.fn(),
        sourceOnly: false,
        isIndexing: false,
      });

      expect(screen.getByRole("button", { name: /re-index/i })).toBeTruthy();
      expect(screen.getByTitle("Clear the current workspace index")).toBeTruthy();
      expect(screen.getByTitle("Clear all indexed workspaces")).toBeTruthy();
      expect(screen.getByRole("button", { name: /source-only view/i })).toBeTruthy();
    });

    it("does not render the workspace actions group when handlers are absent", () => {
      const { container } = renderToolbar();

      const group = container.querySelector(
        '[data-testid="toolbar-group"][aria-label="Workspace actions"]',
      );
      expect(group).toBeNull();
    });

    it("calls onReindex / onClearWorkspace / onClearAll / onToggleSourceOnly", () => {
      const onReindex = vi.fn();
      const onClearWorkspace = vi.fn();
      const onClearAll = vi.fn();
      const onToggleSourceOnly = vi.fn();
      renderToolbar({
        onReindex,
        onClearWorkspace,
        onClearAll,
        onToggleSourceOnly,
        sourceOnly: false,
        isIndexing: false,
      });

      fireEvent.click(screen.getByRole("button", { name: /re-index/i }));
      expect(onReindex).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTitle("Clear the current workspace index"));
      expect(onClearWorkspace).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTitle("Clear all indexed workspaces"));
      expect(onClearAll).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: /source-only view/i }));
      expect(onToggleSourceOnly).toHaveBeenCalledTimes(1);
    });

    it("disables Re-index / Clear while indexing is active", () => {
      renderToolbar({
        onReindex: vi.fn(),
        onClearWorkspace: vi.fn(),
        onClearAll: vi.fn(),
        onToggleSourceOnly: vi.fn(),
        sourceOnly: false,
        isIndexing: true,
      });

      expect(
        (screen.getByRole("button", { name: /indexing/i }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(
        (screen.getByTitle("Clear the current workspace index") as HTMLButtonElement).disabled,
      ).toBe(true);
    });
  });
});
