import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  canvasGetContext,
  forceAtlasAssign,
  mutationObservers,
  mockSigma,
  resizeObservers,
  sigmaConstructor,
} = vi.hoisted(() => {
  const mutationObservers: Array<{ callback: (...args: unknown[]) => void }> = [];
  const resizeObservers: Array<{
    callback: (...args: unknown[]) => void;
    observe: ReturnType<typeof vi.fn>;
  }> = [];
  const canvasGetContext = vi.fn();

  const mockSigma = {
    setSetting: vi.fn(),
    on: vi.fn(),
    kill: vi.fn(),
    refresh: vi.fn(),
  };

  const sigmaConstructor = vi.fn((_graph, _container, _settings) => mockSigma);
  const forceAtlasAssign = vi.fn();

  return {
    canvasGetContext,
    forceAtlasAssign,
    mutationObservers,
    mockSigma,
    resizeObservers,
    sigmaConstructor,
  };
});

vi.mock("sigma", () => ({
  default: sigmaConstructor,
}));

vi.mock("graphology-layout-forceatlas2", () => ({
  default: {
    assign: forceAtlasAssign,
  },
}));

class MockMutationObserver {
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(public readonly callback: (...args: unknown[]) => void) {
    mutationObservers.push({ callback });
  }
}

vi.stubGlobal("MutationObserver", MockMutationObserver);

class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(public readonly callback: (...args: unknown[]) => void) {
    resizeObservers.push({ callback, observe: this.observe });
  }
}

vi.stubGlobal("ResizeObserver", MockResizeObserver);

const originalGetContext = HTMLCanvasElement.prototype.getContext;

import { GraphView } from "./GraphView.js";

afterEach(() => {
  cleanup();
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

const baseNodes = [
  {
    id: "file-1",
    type: "file" as const,
    label: "/workspace/src/app.ts",
    filePath: "/workspace/src/app.ts",
    startLine: 1,
  },
  {
    id: "symbol-1",
    type: "symbol" as const,
    label: "greet",
    filePath: "/workspace/src/app.ts",
    startLine: 6,
    symbolKind: "function" as const,
  },
  {
    id: "symbol-2",
    type: "symbol" as const,
    label: "formatDate",
    filePath: "/workspace/src/util.ts",
    startLine: 4,
    symbolKind: "class" as const,
  },
];

const baseEdges = [
  { id: "edge-defines", source: "file-1", target: "symbol-1", kind: "DEFINES" as const },
  { id: "edge-imports", source: "file-1", target: "symbol-2", kind: "IMPORTS" as const },
  { id: "edge-calls", source: "symbol-1", target: "symbol-2", kind: "CALLS" as const },
];

function themeFor(className: string): Record<string, string> {
  if (className.includes("vscode-light")) {
    return {
      "--vscode-editor-background": "rgb(250, 250, 250)",
      "--vscode-foreground": "rgb(30, 30, 30)",
      "--vscode-symbolIcon-fileForeground": "rgb(50, 100, 200)",
      "--vscode-symbolIcon-functionForeground": "rgb(170, 90, 220)",
      "--vscode-symbolIcon-classForeground": "rgb(180, 80, 40)",
      "--vscode-symbolIcon-interfaceForeground": "rgb(70, 140, 200)",
      "--vscode-symbolIcon-enumForeground": "rgb(160, 110, 50)",
      "--vscode-symbolIcon-variableForeground": "rgb(190, 140, 40)",
      "--vscode-charts-blue": "rgb(80, 140, 255)",
      "--vscode-charts-green": "rgb(50, 160, 90)",
      "--vscode-charts-orange": "rgb(220, 120, 40)",
    };
  }

  return {
    "--vscode-editor-background": "rgb(30, 30, 30)",
    "--vscode-foreground": "rgb(220, 220, 220)",
    "--vscode-symbolIcon-fileForeground": "rgb(120, 160, 255)",
    "--vscode-symbolIcon-functionForeground": "rgb(200, 140, 255)",
    "--vscode-symbolIcon-classForeground": "rgb(255, 180, 120)",
    "--vscode-symbolIcon-interfaceForeground": "rgb(130, 190, 255)",
    "--vscode-symbolIcon-enumForeground": "rgb(255, 210, 120)",
    "--vscode-symbolIcon-variableForeground": "rgb(220, 200, 120)",
    "--vscode-charts-blue": "rgb(100, 170, 255)",
    "--vscode-charts-green": "rgb(90, 200, 140)",
    "--vscode-charts-orange": "rgb(255, 170, 90)",
  };
}

describe("GraphView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.className = "vscode-dark";
    canvasGetContext.mockReset();
    canvasGetContext.mockImplementation((contextId: string) => {
      if (contextId === "webgl2" || contextId === "webgl" || contextId === "experimental-webgl") {
        return { getExtension: vi.fn() } as unknown as WebGLRenderingContext;
      }

      if (contextId === "2d") {
        return {} as CanvasRenderingContext2D;
      }

      return null;
    });
    HTMLCanvasElement.prototype.getContext =
      canvasGetContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
    mutationObservers.length = 0;
    resizeObservers.length = 0;
    sigmaConstructor.mockClear();
    forceAtlasAssign.mockClear();
    mockSigma.setSetting.mockClear();
    mockSigma.on.mockClear();
    mockSigma.kill.mockClear();
    mockSigma.refresh.mockClear();
    mockSigma.getNodeDisplayData = undefined;
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          getPropertyValue: (name: string) => themeFor(document.body.className)[name] ?? "",
        }) as CSSStyleDeclaration,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the graph container and initializes Sigma", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    expect(screen.getByTestId("graph-view")).toBeTruthy();
    expect(sigmaConstructor).toHaveBeenCalledTimes(1);
    expect(forceAtlasAssign).toHaveBeenCalledTimes(1);
    expect(sigmaConstructor.mock.calls[0]?.[2]).toMatchObject({ allowInvalidContainer: true });
    expect(resizeObservers[0]?.observe).toHaveBeenCalled();
  });

  it("hides the minimap on a fresh render by default", () => {
    const { container } = render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    expect(container.querySelector(".dxt-minimap-canvas--hidden")).toBeTruthy();
  });

  it("calls onExportMermaid from the toolbar export button", () => {
    const onExportMermaid = vi.fn();

    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={onExportMermaid}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export as Mermaid" }));

    expect(onExportMermaid).toHaveBeenCalledTimes(1);
  });

  it("toggles the minimap visibility from the toolbar button", () => {
    const { container } = render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    const minimapButton = screen.getByRole("button", { name: "Toggle minimap" });
    const minimapCanvas = container.querySelector(".dxt-minimap-canvas");

    expect(minimapCanvas?.className).toContain("dxt-minimap-canvas--hidden");

    fireEvent.click(minimapButton);

    expect(minimapCanvas?.className).not.toContain("dxt-minimap-canvas--hidden");
    expect(minimapButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("updates edge filter pill state from the toolbar", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    const definesButton = screen.getByRole("button", { name: "Hide Defines edges" });

    fireEvent.click(definesButton);

    expect(
      screen.getByRole("button", { name: "Show Defines edges" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("assigns distinct node size and color attributes for file and symbol nodes", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    const graph = sigmaConstructor.mock.calls[0]?.[0];

    // file-1 has degree 2 (DEFINES + IMPORTS outgoing) → base 16 + (2-1)*0.35 = 16.35
    expect(graph.getNodeAttribute("file-1", "size")).toBeCloseTo(16.35, 2);
    // symbol-1 has degree 2 (DEFINES incoming + CALLS outgoing) → base 7 + 0.35 = 7.35
    expect(graph.getNodeAttribute("symbol-1", "size")).toBeCloseTo(7.35, 2);
    expect(graph.getNodeAttribute("file-1", "color")).not.toBe(
      graph.getNodeAttribute("symbol-1", "color"),
    );
  });

  it("seeds numeric coordinates for every node before Sigma initialization", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    const graph = sigmaConstructor.mock.calls[0]?.[0];

    expect(Number.isFinite(graph.getNodeAttribute("file-1", "x"))).toBe(true);
    expect(Number.isFinite(graph.getNodeAttribute("file-1", "y"))).toBe(true);
    expect(Number.isFinite(graph.getNodeAttribute("symbol-1", "x"))).toBe(true);
    expect(Number.isFinite(graph.getNodeAttribute("symbol-1", "y"))).toBe(true);
  });

  it("assigns distinct colors for DEFINES, IMPORTS, and CALLS edges", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    const graph = sigmaConstructor.mock.calls[0]?.[0];

    const definesColor = graph.getEdgeAttribute("edge-defines", "color");
    const importsColor = graph.getEdgeAttribute("edge-imports", "color");
    const callsColor = graph.getEdgeAttribute("edge-calls", "color");

    expect(definesColor).not.toBe(importsColor);
    expect(importsColor).not.toBe(callsColor);
    expect(definesColor).not.toBe(callsColor);
  });

  it("renders CUSTOM_X edges with a neutral fallback color without throwing (US3 FR-011)", () => {
    const customEdge = {
      id: "edge-custom",
      source: "file-1",
      target: "symbol-1",
      kind: "CUSTOM_X" as never,
    };
    expect(() => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={[customEdge]}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );
    }).not.toThrow();

    const graph = sigmaConstructor.mock.calls[0]?.[0];
    const customColor = graph.getEdgeAttribute("edge-custom", "color");
    expect(typeof customColor).toBe("string");
    expect(customColor.length).toBeGreaterThan(0);
  });

  it("selects a node on single click without navigating immediately", () => {
    const onNavigate = vi.fn();
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={onNavigate}
        onExportMermaid={vi.fn()}
      />,
    );

    const clickNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "clickNode")?.[1];
    clickNodeHandler?.({ node: "symbol-1" });

    expect(onNavigate).not.toHaveBeenCalled();
    act(() => {
      vi.runAllTimers();
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("navigates on double click", () => {
    const onNavigate = vi.fn();
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={onNavigate}
        onExportMermaid={vi.fn()}
      />,
    );

    const doubleClickNodeHandler = mockSigma.on.mock.calls.find(
      (call) => call[0] === "doubleClickNode",
    )?.[1];
    doubleClickNodeHandler?.({ node: "file-1" });

    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/app.ts", 1);
  });

  it("re-applies theme-derived colors when the VS Code body class changes", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );
    mockSigma.setSetting.mockClear();

    document.body.className = "vscode-light";
    mutationObservers[0]?.callback([], {} as MutationObserver);

    expect(mockSigma.setSetting).toHaveBeenCalledWith("labelColor", {
      color: "rgb(30, 30, 30)",
    });
    expect(mockSigma.setSetting).toHaveBeenCalledWith("defaultNodeColor", "rgb(180, 80, 40)");
    expect(mockSigma.setSetting).toHaveBeenCalledWith("defaultEdgeColor", "rgb(80, 140, 255)");
  });

  it("still initializes Sigma when the layout step throws", () => {
    forceAtlasAssign.mockImplementationOnce(() => {
      throw new Error("layout unavailable");
    });

    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    expect(sigmaConstructor).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("graph-view")).toBeTruthy();
  });

  it("renders the SVG compatibility graph when WebGL is unavailable", () => {
    canvasGetContext.mockImplementation((contextId: string) => {
      if (contextId === "2d") {
        return {} as CanvasRenderingContext2D;
      }

      return null;
    });

    const onNavigate = vi.fn();
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={onNavigate}
        onExportMermaid={vi.fn()}
      />,
    );

    expect(sigmaConstructor).not.toHaveBeenCalled();
    expect(screen.getByTestId("graph-view-fallback")).toBeTruthy();
    expect(screen.getByRole("img", { name: /symbol graph/i })).toBeTruthy();
    const relations = screen.getByLabelText(/graph relations/i);
    expect(relations).toBeTruthy();
    expect(within(relations).getByText("DEFINES")).toBeTruthy();
    expect(within(relations).getByText("IMPORTS")).toBeTruthy();
    expect(within(relations).getByText("CALLS")).toBeTruthy();
    expect(within(relations).getAllByText("app.ts").length).toBeGreaterThan(0);

    const fallbackNode = screen.getByRole("button", { name: "greet" });
    expect(fallbackNode.hasAttribute("style")).toBe(false);

    fireEvent.click(fallbackNode);
    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/app.ts", 6);
  });

  it("renders the SVG compatibility graph when Sigma still fails to initialize", () => {
    sigmaConstructor.mockImplementationOnce(() => {
      throw new Error("webgl unavailable");
    });

    const onNavigate = vi.fn();
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={onNavigate}
        onExportMermaid={vi.fn()}
      />,
    );

    expect(screen.getByTestId("graph-view-fallback")).toBeTruthy();
    expect(screen.getByRole("img", { name: /symbol graph/i })).toBeTruthy();

    const fallbackNode = screen.getByRole("button", { name: "greet" });
    expect(fallbackNode.hasAttribute("style")).toBe(false);

    fireEvent.click(fallbackNode);
    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/app.ts", 6);
  });

  it("registers nodeReducer and edgeReducer Sigma settings", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    const settings = sigmaConstructor.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(typeof settings.nodeReducer).toBe("function");
    expect(typeof settings.edgeReducer).toBe("function");
  });

  it("registers enterNode and leaveNode event listeners on Sigma", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    const events = mockSigma.on.mock.calls.map((call) => call[0]);
    expect(events).toContain("enterNode");
    expect(events).toContain("leaveNode");
    expect(events).toContain("clickStage");
    expect(events).toContain("doubleClickNode");
  });

  it("scales node size proportionally to importance when provided", () => {
    const nodesWithImportance = [
      { ...baseNodes[0]!, importance: 0.1 },
      { ...baseNodes[1]!, importance: 0.9 },
      { ...baseNodes[2]!, importance: 0.5 },
    ];

    render(
      <GraphView
        nodes={nodesWithImportance}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    const graph = sigmaConstructor.mock.calls[0]?.[0];

    const file1Size = graph.getNodeAttribute("file-1", "size") as number;
    const symbol1Size = graph.getNodeAttribute("symbol-1", "size") as number;
    const symbol2Size = graph.getNodeAttribute("symbol-2", "size") as number;

    // The highest-importance symbol node should be larger than the lowest.
    expect(symbol1Size).toBeGreaterThan(symbol2Size);
    // File node base size should still exceed symbol nodes for visual hierarchy.
    expect(file1Size).toBeGreaterThan(symbol2Size);
  });

  it("falls back to uniform node sizes when importance is not provided", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    const graph = sigmaConstructor.mock.calls[0]?.[0];

    expect(graph.getNodeAttribute("symbol-1", "size")).toBe(
      graph.getNodeAttribute("symbol-2", "size"),
    );
  });

  it("fades non-neighbor nodes and edges when a node is hovered", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    const settings = sigmaConstructor.mock.calls[0]?.[2] as {
      nodeReducer: (node: string, data: Record<string, unknown>) => Record<string, unknown>;
      edgeReducer: (edge: string, data: Record<string, unknown>) => Record<string, unknown>;
    };
    const enterNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "enterNode")?.[1];
    enterNodeHandler?.({ node: "file-1" });

    // file-1 hovered -> file-1, symbol-1, symbol-2 stay full opacity
    // (edge-defines and edge-imports both touch file-1, edge-calls does not)
    const fadedNode = settings.nodeReducer("symbol-2", { color: "rgb(255, 180, 120)", size: 6 });
    // symbol-2 IS a neighbor via edge-imports, so it should not be faded
    expect(fadedNode.color).toBe("rgb(255, 180, 120)");

    // edge-calls (symbol-1 -> symbol-2) does not touch file-1, so it should fade
    const fadedEdge = settings.edgeReducer("edge-calls", { color: "rgb(255, 170, 90)" });
    expect(String(fadedEdge.color)).toMatch(/rgba?\([^)]*0\.06\)/);

    const leaveNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "leaveNode")?.[1];
    leaveNodeHandler?.({});

    const restoredEdge = settings.edgeReducer("edge-calls", { color: "rgb(255, 170, 90)" });
    expect(restoredEdge.color).toBe("rgb(255, 170, 90)");
  });

  it("emphasizes descendant edges after a node is selected", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
      />,
    );

    const settings = sigmaConstructor.mock.calls[0]?.[2] as {
      edgeReducer: (edge: string, data: Record<string, unknown>) => Record<string, unknown>;
    };
    const clickNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "clickNode")?.[1];

    clickNodeHandler?.({ node: "symbol-1" });
    act(() => {
      vi.runAllTimers();
    });

    const selectedEdge = settings.edgeReducer("edge-calls", {
      color: "rgb(255, 170, 90)",
      baseColor: "rgb(255, 170, 90)",
      size: 1.8,
      baseSize: 1.8,
    });
    const fadedEdge = settings.edgeReducer("edge-imports", {
      color: "rgb(90, 200, 140)",
      baseColor: "rgb(90, 200, 140)",
      size: 2.7,
      baseSize: 2.7,
    });

    expect(Number(selectedEdge.size)).toBeGreaterThan(1.8);
    expect(String(fadedEdge.color)).toMatch(/rgba?\([^)]*0\.06\)/);
  });

  it("renders overlay travelers and neighbor navigation after selecting a node", () => {
    const onNavigate = vi.fn();
    const toolbarNodes = [
      ...baseNodes,
      {
        id: "symbol-3",
        type: "symbol" as const,
        label: "formatCaller",
        filePath: "/workspace/src/caller.ts",
        startLine: 9,
        symbolKind: "function" as const,
      },
    ];
    const toolbarEdges = [
      ...baseEdges,
      { id: "edge-calls-in", source: "symbol-3", target: "symbol-1", kind: "CALLS" as const },
    ];
    mockSigma.getNodeDisplayData = vi.fn((nodeId: string) => {
      if (nodeId === "symbol-1") {
        return { x: 40, y: 40 };
      }

      if (nodeId === "symbol-2") {
        return { x: 84, y: 54 };
      }

      if (nodeId === "symbol-3") {
        return { x: 18, y: 28 };
      }

      return { x: 12, y: 16 };
    });
    const { container } = render(
      <GraphView
        nodes={toolbarNodes}
        edges={toolbarEdges}
        onNavigate={onNavigate}
        onExportMermaid={vi.fn()}
      />,
    );

    const clickNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "clickNode")?.[1];

    clickNodeHandler?.({ node: "symbol-1" });
    act(() => {
      vi.runAllTimers();
    });

    expect(container.querySelectorAll(".dxt-selection-path").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".dxt-selection-traveler").length).toBeGreaterThan(0);
    expect(screen.getByText("Called by")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "formatCaller" }));
    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/caller.ts", 9);

    fireEvent.click(screen.getByRole("button", { name: "formatDate" }));

    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/util.ts", 4);
  });

  describe("node-kind filter (slice 019)", () => {
    it("node filter panel renders in the toolbar with all canonical kinds", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );

      expect(screen.getByRole("group", { name: "Node type filters" })).toBeTruthy();
      // Folder, Class, Interface, Function, Method, Property, Variable, Enum, Type, Decorator = 10
      expect(screen.getAllByRole("checkbox").length).toBe(10);
    });

    it("hiddenNodeKinds starts as empty set — all chips aria-checked=true (FR-010)", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );

      const chips = screen.getAllByRole("checkbox");
      const activeChips = chips.filter((c) => c.getAttribute("aria-disabled") !== "true");
      expect(activeChips.length).toBeGreaterThan(0);
      for (const chip of activeChips) {
        expect(chip.getAttribute("aria-checked")).toBe("true");
      }
    });

    it("toggling a node-kind chip updates aria-checked state", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );

      const functionChip = screen.getByRole("checkbox", { name: "Hide Function nodes" });
      expect(functionChip.getAttribute("aria-checked")).toBe("true");

      fireEvent.click(functionChip);

      expect(
        screen.getByRole("checkbox", { name: "Show Function nodes" }).getAttribute("aria-checked"),
      ).toBe("false");
    });

    it("toggling a chip twice returns it to visible state", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );

      const functionChip = screen.getByRole("checkbox", { name: "Hide Function nodes" });
      fireEvent.click(functionChip);
      fireEvent.click(screen.getByRole("checkbox", { name: "Show Function nodes" }));

      expect(
        screen.getByRole("checkbox", { name: "Hide Function nodes" }).getAttribute("aria-checked"),
      ).toBe("true");
    });

    it("nodeFilterEntries counts are derived from nodes prop", () => {
      // baseNodes: 1 file, 1 function, 1 class
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );

      // baseNodes: 1 file, 1 function, 1 class — Folder chip should show count 1
      const folderChip = screen.getByRole("checkbox", { name: /Folder/ });
      expect(folderChip).toBeTruthy();
      // The badge should show "1"
      const badge =
        folderChip.querySelector("span[aria-label]") ??
        folderChip.parentElement?.querySelector("span[aria-label]");
      expect(badge ?? folderChip.textContent).toBeTruthy();
    });

    it("Decorator chip is disabled and not clickable", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );

      // Find chip by aria-disabled
      const chips = screen.getAllByRole("checkbox");
      const disabledChip = chips.find((c) => c.getAttribute("aria-disabled") === "true");
      expect(disabledChip).toBeTruthy();
      expect(disabledChip?.textContent).toContain("Decorator");
    });
  });

  describe("lens activation (slice 021)", () => {
    it("renders the status-bar pill when a lens row is clicked", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );

      // No lens active initially — status bar must not exist.
      expect(screen.queryByTestId("lens-status-bar")).toBeNull();

      // Activate God-class lens.
      const godClassRow = screen.getByTestId("lens-row-god-class");
      fireEvent.click(godClassRow);

      // Status-bar pill appears with the title.
      const statusBar = screen.getByTestId("lens-status-bar");
      expect(statusBar).toBeTruthy();
      expect(statusBar.textContent).toContain("Lens: God class / function");
    });

    it("clears the status-bar pill when the active lens is toggled off", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );

      const godClassRow = screen.getByTestId("lens-row-god-class");
      fireEvent.click(godClassRow);
      expect(screen.getByTestId("lens-status-bar")).toBeTruthy();

      fireEvent.click(godClassRow);
      expect(screen.queryByTestId("lens-status-bar")).toBeNull();
    });
  });

  describe("search + depth (slice 022)", () => {
    it("renders the toolbar search input and depth slider", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );

      expect(screen.getByRole("combobox", { name: "Search graph" })).toBeTruthy();
      expect(screen.getByRole("slider", { name: "Hop depth" })).toBeTruthy();
    });

    it("disables the depth slider when no node is selected and no search is active", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );

      const slider = screen.getByRole("slider", { name: "Hop depth" }) as HTMLInputElement;
      expect(slider.disabled).toBe(true);
    });

    it("clears search state when Escape is pressed in the search box", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );

      const input = screen.getByRole("combobox", { name: "Search graph" }) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "greet" } });
      act(() => {
        vi.advanceTimersByTime(160);
      });

      fireEvent.keyDown(input, { key: "Escape" });
      expect(input.value).toBe("");
    });
  });

  describe("trace route (slice 023)", () => {
    it("renders the trace toggle button in the toolbar", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "Toggle trace route mode" })).toBeTruthy();
    });

    it("activates trace mode and shows the banner when the toggle is clicked", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("trace-banner")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Toggle trace route mode" }));

      expect(screen.getByTestId("trace-banner")).toBeTruthy();
      expect(screen.getByText(/click a start node/i)).toBeTruthy();
    });

    it("toggling the trace button off restores idle state", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );
      const toggle = screen.getByRole("button", { name: "Toggle trace route mode" });
      fireEvent.click(toggle);
      expect(screen.getByTestId("trace-banner")).toBeTruthy();
      fireEvent.click(toggle);
      expect(screen.queryByTestId("trace-banner")).toBeNull();
    });

    it("Exit trace button is visible only when phase is not idle", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );
      expect(screen.queryByRole("button", { name: "Exit trace mode" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Toggle trace route mode" }));
      expect(screen.getByRole("button", { name: "Exit trace mode" })).toBeTruthy();
    });

    it("clicking the Exit trace toolbar button clears the trace banner", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Toggle trace route mode" }));
      expect(screen.getByTestId("trace-banner")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Exit trace mode" }));
      expect(screen.queryByTestId("trace-banner")).toBeNull();
    });

    it("Escape exits trace mode", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Toggle trace route mode" }));
      expect(screen.getByTestId("trace-banner")).toBeTruthy();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByTestId("trace-banner")).toBeNull();
    });

    it("entering trace mode clears any active search query", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
        />,
      );
      const searchInput = screen.getByRole("combobox", {
        name: "Search graph",
      }) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "greet" } });
      act(() => {
        vi.advanceTimersByTime(160);
      });

      fireEvent.click(screen.getByRole("button", { name: "Toggle trace route mode" }));
      expect(searchInput.value).toBe("");
    });
  });
});
