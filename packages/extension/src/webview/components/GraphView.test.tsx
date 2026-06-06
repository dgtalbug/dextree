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

  // Use a function declaration (not arrow) so `new sigmaConstructor()` works.
  // Vitest 4 tightened vi.fn semantics — arrow functions no longer have a
  // [[Construct]] internal slot when invoked with `new`.
  const sigmaConstructor = vi.fn(function SigmaCtor(_graph, _container, _settings) {
    return mockSigma;
  });
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

// The real `sigma/rendering` module reads WebGL2RenderingContext at import
// time, which jsdom does not expose. Stub the named exports we use; the body
// of these classes is irrelevant to the tests because Sigma itself is mocked.
vi.mock("sigma/rendering", () => ({
  NodeCircleProgram: class FakeNodeCircleProgram {},
}));

vi.mock("@sigma/node-square", () => ({
  NodeSquareProgram: class FakeNodeSquareProgram {},
}));

vi.mock("@sigma/node-border", () => ({
  createNodeBorderProgram: vi.fn(() => class FakeNodeBorderProgram {}),
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
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Mermaid preview export" }));

    expect(onExportMermaid).toHaveBeenCalledTimes(1);
  });

  it("toggles the minimap visibility from the toolbar button", () => {
    const { container } = render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
        onExportCurrentView={vi.fn()}
      />,
    );

    const minimapButton = screen.getByRole("button", { name: "Toggle minimap" });
    const minimapCanvas = container.querySelector(".dxt-minimap-canvas");

    expect(minimapCanvas?.className).toContain("dxt-minimap-canvas--hidden");

    fireEvent.click(minimapButton);

    expect(minimapCanvas?.className).not.toContain("dxt-minimap-canvas--hidden");
    expect(minimapButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("assigns distinct node size and color attributes for file and symbol nodes", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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
          onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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

  it("does not recenter the camera when a node is selected by single click (slice 033)", () => {
    // Selecting a node should highlight + inspect it without moving the viewport;
    // an auto-recenter makes the whole graph jump under the cursor. The camera
    // only moves on explicit Fit / search-result navigation.
    const animate = vi.fn();
    mockSigma.getCamera = () => ({
      animate,
      getState: () => ({ x: 0.5, y: 0.5, ratio: 1 }),
    });
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
        onExportCurrentView={vi.fn()}
      />,
    );

    const clickNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "clickNode")?.[1];
    clickNodeHandler?.({ node: "symbol-1" });
    act(() => {
      vi.runAllTimers();
    });

    expect(animate).not.toHaveBeenCalled();
  });

  it("navigates on double click", () => {
    const onNavigate = vi.fn();
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={onNavigate}
        onExportMermaid={vi.fn()}
        onExportCurrentView={vi.fn()}
      />,
    );

    const doubleClickNodeHandler = mockSigma.on.mock.calls.find(
      (call) => call[0] === "doubleClickNode",
    )?.[1];
    doubleClickNodeHandler?.({ node: "file-1" });

    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/app.ts", 1);
  });

  it("opens the file when a search result is selected (slice graphview-lens-v2)", () => {
    const onNavigate = vi.fn();
    const animate = vi.fn();
    mockSigma.getCamera = () => ({
      animate,
      getState: () => ({ x: 0.5, y: 0.5, ratio: 1 }),
    });
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={onNavigate}
        onExportMermaid={vi.fn()}
        onExportCurrentView={vi.fn()}
      />,
    );

    // Type a query that matches "greet" (symbol-1). SearchBar debounces before
    // committing the query upward, so flush timers to surface the results.
    const input = screen.getByPlaceholderText(/search symbols/i);
    fireEvent.change(input, { target: { value: "greet" } });
    act(() => {
      vi.runAllTimers();
    });
    const option = screen.getByRole("option", { name: /greet/i });
    fireEvent.click(option);

    // The file opens at the symbol's line — the core fix (was camera-only).
    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/app.ts", 6);
    // And the camera flies (animate called), unlike a plain canvas selection.
    expect(animate).toHaveBeenCalled();
  });

  it("re-applies theme-derived colors when the VS Code body class changes", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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
        onExportCurrentView={vi.fn()}
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

    // On leave the hover fade is removed: the edge returns to its no-hover
    // baseline. (That baseline is the un-emphasised member state — which may
    // itself carry inter-community dimming from cluster-aesthetics — so assert
    // the strong hover fade (alpha 0.06) is gone rather than an exact hex.)
    const restoredEdge = settings.edgeReducer("edge-calls", { color: "rgb(255, 170, 90)" });
    expect(String(restoredEdge.color)).not.toMatch(/0\.06\)/);
  });

  it("emphasizes descendant edges after a node is selected", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
        onExportCurrentView={vi.fn()}
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

  it("colours a selected node's outbound CALLS edge as a dashed callee edge", () => {
    render(
      <GraphView
        nodes={baseNodes}
        edges={baseEdges}
        onNavigate={vi.fn()}
        onExportMermaid={vi.fn()}
        onExportCurrentView={vi.fn()}
      />,
    );

    const settings = sigmaConstructor.mock.calls[0]?.[2] as {
      edgeReducer: (edge: string, data: Record<string, unknown>) => Record<string, unknown>;
    };
    const clickNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "clickNode")?.[1];

    // Select symbol-1; edge-calls (symbol-1 -> symbol-2) is its OUTBOUND call.
    clickNodeHandler?.({ node: "symbol-1" });
    act(() => {
      vi.runAllTimers();
    });

    const baseCallsColor = "rgb(255, 170, 90)";
    const calleeEdge = settings.edgeReducer("edge-calls", {
      edgeKind: "CALLS",
      color: baseCallsColor,
      baseColor: baseCallsColor,
      size: 1.8,
      baseSize: 1.8,
    });

    // Outbound CALLS from the selected node is emphasised: enlarged and
    // recoloured to the callee hue (NOT given an unregistered edge `type`,
    // which would crash Sigma's renderer).
    expect(calleeEdge.type).toBeUndefined();
    expect(typeof calleeEdge.color).toBe("string");
    expect(Number(calleeEdge.size)).toBeGreaterThan(1.8);
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
        onExportCurrentView={vi.fn()}
      />,
    );

    const clickNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "clickNode")?.[1];

    clickNodeHandler?.({ node: "symbol-1" });
    act(() => {
      vi.runAllTimers();
    });

    expect(container.querySelectorAll(".dxt-selection-path").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".dxt-selection-traveler").length).toBeGreaterThan(0);
    // Neighbors now render in the Inspector (right rail), not a floating canvas
    // panel. Group titles carry a count ("Called by · N"); rows are addressable
    // by neighbor-row-<id> and clicking one navigates to that symbol.
    expect(screen.getByText(/Called by/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("neighbor-row-symbol-3"));
    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/caller.ts", 9);

    fireEvent.click(screen.getByTestId("neighbor-row-symbol-2"));

    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/util.ts", 4);
  });

  describe("lens activation (slice 021)", () => {
    it("renders the status-bar pill when a lens row is clicked", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
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
      expect(statusBar.textContent).toContain("Lens: God class");
    });

    it("clears the status-bar pill when the active lens is toggled off", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const godClassRow = screen.getByTestId("lens-row-god-class");
      fireEvent.click(godClassRow);
      expect(screen.getByTestId("lens-status-bar")).toBeTruthy();

      fireEvent.click(godClassRow);
      expect(screen.queryByTestId("lens-status-bar")).toBeNull();
    });

    it("shows the result table on lens activation and removes it on toggle-off", () => {
      const rankedNodes = [
        { ...baseNodes[0]!, fanIn: 5 },
        { ...baseNodes[1]!, fanIn: 9 },
        { ...baseNodes[2]!, fanIn: 1 },
      ];
      render(
        <GraphView
          nodes={rankedNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      // No lens → no table.
      expect(screen.queryByTestId("lens-result-table")).toBeNull();

      // Activate Most-used (a rankable lens) → table appears with ranked rows.
      fireEvent.click(screen.getByTestId("lens-row-most-used"));
      const table = screen.getByTestId("lens-result-table");
      expect(table.textContent).toContain("Most used");
      expect(screen.getAllByTestId(/lens-result-row-/).length).toBeGreaterThan(0);

      // Toggle off → table is removed.
      fireEvent.click(screen.getByTestId("lens-row-most-used"));
      expect(screen.queryByTestId("lens-result-table")).toBeNull();
    });

    it("does not show the result table for the architecture (recolour) lens", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId("lens-row-architecture"));
      // Architecture recolours the graph; it has no ranked table.
      expect(screen.queryByTestId("lens-result-table")).toBeNull();
    });
  });

  describe("entry-points + architecture lenses", () => {
    const layeredNodes = [
      ...baseNodes,
      {
        id: "symbol-pres",
        type: "symbol" as const,
        label: "render",
        filePath: "/workspace/src/ui/render.ts",
        startLine: 2,
        symbolKind: "function" as const,
        entryKind: "handler" as const,
        archLayer: "presentation" as const,
      },
      {
        id: "symbol-unknown",
        type: "symbol" as const,
        label: "misc",
        filePath: "/workspace/src/misc.ts",
        startLine: 2,
        symbolKind: "function" as const,
        entryKind: "unclassified" as const,
        archLayer: "unknown" as const,
      },
    ];

    function getNodeReducer() {
      return (
        sigmaConstructor.mock.calls[0]?.[2] as {
          nodeReducer: (node: string, data: Record<string, unknown>) => Record<string, unknown>;
        }
      ).nodeReducer;
    }

    it("recolours a known-layer node and shows the layer legend when architecture is active", () => {
      render(
        <GraphView
          nodes={layeredNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId("lens-row-architecture"));

      expect(screen.getByTestId("lens-layer-legend")).toBeTruthy();

      const nodeReducer = getNodeReducer();
      const out = nodeReducer("symbol-pres", {
        color: "#808080",
        archLayer: "presentation",
        size: 6,
      });
      expect(out.color).toContain("var(--vscode-charts-blue");
    });

    it("leaves an unknown-layer node at its base colour under the architecture lens", () => {
      render(
        <GraphView
          nodes={layeredNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId("lens-row-architecture"));

      const nodeReducer = getNodeReducer();
      const out = nodeReducer("symbol-unknown", {
        color: "#808080",
        archLayer: "unknown",
        size: 6,
      });
      expect(out.color).toBe("#808080");
    });

    it("scopes membership to the lens subject under the entry-points lens", () => {
      render(
        <GraphView
          nodes={layeredNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId("lens-row-entry-points"));

      const nodeReducer = getNodeReducer();
      // Lens-first hierarchy: the lens is the subject. symbol-unknown is not an
      // entry point → outside the subject → hidden (membership, not dimming).
      const hidden = nodeReducer("symbol-unknown", { color: "rgb(128, 128, 128)", size: 6 });
      expect(hidden.hidden).toBe(true);
      // symbol-pres is a handler → in the subject → a full member.
      const kept = nodeReducer("symbol-pres", { color: "rgb(128, 128, 128)", size: 6 });
      expect(kept.hidden).toBeUndefined();
      expect(kept.color).toBe("rgb(128, 128, 128)");
    });

    it("does not show the layer legend for a match-set lens", () => {
      render(
        <GraphView
          nodes={layeredNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId("lens-row-entry-points"));
      expect(screen.queryByTestId("lens-layer-legend")).toBeNull();
    });

    it("shows the lens-first hierarchy hint only while a lens is active", () => {
      render(
        <GraphView
          nodes={layeredNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      // No hint before a lens is active.
      expect(screen.queryByTestId("lens-refine-hint")).toBeNull();

      fireEvent.click(screen.getByTestId("lens-row-entry-points"));
      const hint = screen.getByTestId("lens-refine-hint");
      expect(hint.textContent).toMatch(/refine/i);

      // Deactivating the lens removes the hint (filters return to whole-graph).
      fireEvent.click(screen.getByTestId("lens-row-entry-points"));
      expect(screen.queryByTestId("lens-refine-hint")).toBeNull();
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
          onExportCurrentView={vi.fn()}
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
          onExportCurrentView={vi.fn()}
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
          onExportCurrentView={vi.fn()}
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
          onExportCurrentView={vi.fn()}
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
          onExportCurrentView={vi.fn()}
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
          onExportCurrentView={vi.fn()}
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
          onExportCurrentView={vi.fn()}
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
          onExportCurrentView={vi.fn()}
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
          onExportCurrentView={vi.fn()}
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
          onExportCurrentView={vi.fn()}
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

    // Slice 033 Phase 5 — trace variant of the GraphView shell.
    it("gives the Trace toolbar button accent styling and aria-pressed when active (T032)", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );
      const toggle = screen.getByRole("button", { name: "Toggle trace route mode" });
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      const idleClass = toggle.className;

      fireEvent.click(toggle);

      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      // The active Trace button switches to the accent treatment (mockup).
      expect(toggle.className).not.toBe(idleClass);
    });

    it("shows the Export this trace button only while tracing (T032)", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
          onExportTraceSequence={vi.fn()}
        />,
      );
      expect(screen.queryByRole("button", { name: /export this trace/i })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Toggle trace route mode" }));
      expect(screen.getByRole("button", { name: /export this trace/i })).toBeTruthy();
    });

    it("swaps the left rail to trace path content when a path is active (T029)", async () => {
      mockSigma.getNodeDisplayData = vi.fn(() => ({ x: 10, y: 10 }));
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      // Standard left rail shows Lenses + Node Types before tracing.
      expect(screen.getByTestId("node-filter-panel")).toBeTruthy();

      const clickNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "clickNode")?.[1];

      // Enter trace mode, then pick start + end on a connected pair. The second
      // pick schedules path resolution on a microtask, so flush microtasks.
      fireEvent.click(screen.getByRole("button", { name: "Toggle trace route mode" }));
      clickNodeHandler?.({ node: "symbol-1" });
      clickNodeHandler?.({ node: "symbol-2" });
      await act(async () => {
        await Promise.resolve();
        vi.runOnlyPendingTimers();
      });

      // Once a path is active the left rail surfaces trace path content and the
      // standard Node Types filter is no longer shown there.
      expect(screen.getByTestId("trace-left-rail")).toBeTruthy();
      expect(screen.queryByTestId("node-filter-panel")).toBeNull();
    });

    it("refuses a trace whose endpoint is filtered out of the visible view (T-bounded)", async () => {
      mockSigma.getNodeDisplayData = vi.fn(() => ({ x: 10, y: 10 }));
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      // Hide the "class" node kind so symbol-2 (a class) leaves the VisibleView.
      const classToggle = screen.getByRole("checkbox", { name: "Hide Class nodes" });
      fireEvent.click(classToggle);

      const clickNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "clickNode")?.[1];

      // Trace from the still-visible function to the now-hidden class. The path
      // must not run through the filtered-out node: a no-path notice appears.
      fireEvent.click(screen.getByRole("button", { name: "Toggle trace route mode" }));
      clickNodeHandler?.({ node: "symbol-1" });
      clickNodeHandler?.({ node: "symbol-2" });
      await act(async () => {
        await Promise.resolve();
        vi.runOnlyPendingTimers();
      });

      // The trace resolves to "no path" rather than tracing through the hidden
      // node: the inspector shows the no-path status notice and the left-rail
      // Path group has zero hops.
      const noPathNotice = screen
        .getAllByRole("status")
        .find((el) => /no path found/i.test(el.textContent ?? ""));
      expect(noPathNotice).toBeTruthy();
      expect(screen.getByText(/Path \(0 hops\)/)).toBeTruthy();
    });
  });

  describe("cluster-hull persistence", () => {
    it("restores hulls-off from the persisted preference", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
          initialShowClusterHulls={false}
        />,
      );
      const toggle = screen.getByRole("button", { name: "Toggle file cluster hulls" });
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });

    it("defaults hulls on when no preference is persisted", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );
      const toggle = screen.getByRole("button", { name: "Toggle file cluster hulls" });
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
    });

    it("persists the new preference when the hull toggle is clicked", () => {
      const onPersistClusterHulls = vi.fn();
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
          onPersistClusterHulls={onPersistClusterHulls}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Toggle file cluster hulls" }));
      // Default is on → toggling persists "off".
      expect(onPersistClusterHulls).toHaveBeenCalledWith(false);
    });
  });

  describe("node focus", () => {
    it("focuses a selected node and shows the exit chip, then restores on exit", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      // Select a node so the Inspector populates with its actions.
      const clickNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "clickNode")?.[1];
      clickNodeHandler?.({ node: "symbol-1" });
      act(() => {
        vi.runAllTimers();
      });

      // No focus chip before focusing.
      expect(screen.queryByTestId("focus-chip")).toBeNull();

      // Enter focus from the Inspector.
      fireEvent.click(screen.getByTestId("focus-node"));
      expect(screen.getByTestId("focus-chip")).toBeTruthy();

      // Exit focus restores the non-focused view (chip gone).
      fireEvent.click(screen.getByTestId("focus-exit"));
      expect(screen.queryByTestId("focus-chip")).toBeNull();
    });
  });

  describe("layout presets (slice 025 US1)", () => {
    it("shows ForceAtlas2 as the default active layout when GraphView opens (FR-003)", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const select = screen.getByRole("combobox", { name: "Layout preset" }) as HTMLSelectElement;
      expect(select.value).toBe("forceAtlas2");
    });

    it("exposes ForceAtlas2 + Circular + Hierarchical as the three options (FR-002)", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const select = screen.getByRole("combobox", { name: "Layout preset" }) as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.value)).toEqual([
        "forceAtlas2",
        "circular",
        "hierarchical",
      ]);
    });

    it("re-selecting the active preset is a safe no-op (FR-012, US1 acceptance #4)", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const select = screen.getByRole("combobox", { name: "Layout preset" }) as HTMLSelectElement;
      forceAtlasAssign.mockClear();

      // Selecting forceAtlas2 again should not retrigger the layout assignment.
      fireEvent.change(select, { target: { value: "forceAtlas2" } });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(forceAtlasAssign).not.toHaveBeenCalled();
      expect(select.value).toBe("forceAtlas2");
    });
  });

  describe("layout presets — Circular (slice 025 US2)", () => {
    it("updates the dropdown to circular and refreshes Sigma when Circular is selected (FR-005)", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const select = screen.getByRole("combobox", { name: "Layout preset" }) as HTMLSelectElement;
      mockSigma.refresh.mockClear();

      fireEvent.change(select, { target: { value: "circular" } });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(select.value).toBe("circular");
      expect(mockSigma.refresh).toHaveBeenCalled();
    });

    it("operates on pass 1-only graphs without requiring lazy enrichment (FR-011, SC-004)", () => {
      // Pass 1-only: file-with-symbols, no resolved CALLS edges.
      const pass1Nodes = baseNodes;
      const pass1Edges = baseEdges.filter((e) => e.kind !== "CALLS");

      render(
        <GraphView
          nodes={pass1Nodes}
          edges={pass1Edges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const select = screen.getByRole("combobox", { name: "Layout preset" }) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "circular" } });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(select.value).toBe("circular");
    });
  });

  describe("layout presets — Hierarchical (slice 025 US3)", () => {
    it("applies layered positions on a DAG-suitable graph (FR-007)", () => {
      // baseEdges has DEFINES + IMPORTS + CALLS — these form a DAG.
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const select = screen.getByRole("combobox", { name: "Layout preset" }) as HTMLSelectElement;
      mockSigma.refresh.mockClear();

      fireEvent.change(select, { target: { value: "hierarchical" } });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(select.value).toBe("hierarchical");
      expect(mockSigma.refresh).toHaveBeenCalled();
      // No fallback notice surfaces on a successful application.
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("last-selection-wins on rapid switching (US3 edge case)", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const select = screen.getByRole("combobox", { name: "Layout preset" }) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "circular" } });
      fireEvent.change(select, { target: { value: "hierarchical" } });
      fireEvent.change(select, { target: { value: "forceAtlas2" } });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(select.value).toBe("forceAtlas2");
    });
  });

  describe("entry-symbol styling (slice 026)", () => {
    it("registers circle, square, and entry node program classes with Sigma", () => {
      render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const settings = sigmaConstructor.mock.calls[0]?.[2] as Record<string, unknown>;
      const programs = settings.nodeProgramClasses as Record<string, unknown>;
      expect(programs).toBeDefined();
      expect(Object.keys(programs).sort()).toEqual(["circle", "entry", "square"]);
    });

    it("assigns type='entry' on symbol nodes classified as a non-unclassified entry kind", () => {
      const nodes = [
        ...baseNodes,
        {
          id: "symbol-handler",
          type: "symbol" as const,
          label: "onClick",
          filePath: "/workspace/src/Button.tsx",
          startLine: 12,
          symbolKind: "function" as const,
          entryKind: "handler" as const,
        },
        {
          id: "symbol-public",
          type: "symbol" as const,
          label: "createIndexer",
          filePath: "/workspace/src/index.ts",
          startLine: 1,
          symbolKind: "function" as const,
          entryKind: "public-api" as const,
        },
      ];

      render(
        <GraphView
          nodes={nodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const graph = sigmaConstructor.mock.calls[0]?.[0];
      expect(graph.getNodeAttribute("symbol-handler", "type")).toBe("entry");
      expect(graph.getNodeAttribute("symbol-handler", "entryKind")).toBe("handler");
      expect(graph.getNodeAttribute("symbol-public", "type")).toBe("entry");
      expect(graph.getNodeAttribute("symbol-public", "entryKind")).toBe("public-api");
    });

    it("omits the type attribute for unclassified or missing entryKind so the node falls back to default circle rendering", () => {
      const nodes = [
        ...baseNodes,
        {
          id: "symbol-unclassified",
          type: "symbol" as const,
          label: "helper",
          filePath: "/workspace/src/util.ts",
          startLine: 4,
          symbolKind: "function" as const,
          entryKind: "unclassified" as const,
        },
      ];

      render(
        <GraphView
          nodes={nodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const graph = sigmaConstructor.mock.calls[0]?.[0];
      // unclassified symbol — entryKind flows through but no `type` override.
      expect(graph.getNodeAttribute("symbol-unclassified", "entryKind")).toBe("unclassified");
      expect(graph.getNodeAttribute("symbol-unclassified", "type")).toBeUndefined();
      // baseNodes have no entryKind at all — should also have no type override.
      expect(graph.getNodeAttribute("symbol-1", "entryKind")).toBeUndefined();
      expect(graph.getNodeAttribute("symbol-1", "type")).toBeUndefined();
    });

    it("projects archLayer onto symbol nodes when present", () => {
      const nodes = [
        ...baseNodes,
        {
          id: "symbol-layered",
          type: "symbol" as const,
          label: "render",
          filePath: "/workspace/src/components/Card.tsx",
          startLine: 5,
          symbolKind: "function" as const,
          entryKind: "handler" as const,
          archLayer: "presentation" as const,
        },
      ];

      render(
        <GraphView
          nodes={nodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const graph = sigmaConstructor.mock.calls[0]?.[0];
      expect(graph.getNodeAttribute("symbol-layered", "archLayer")).toBe("presentation");
    });

    it("renders mixed-classification workspaces without dropping unclassified symbols (US3)", () => {
      // Reproduces the pass-1-only / ambiguous-workspace scenario from US3:
      // a classified entry, an unclassified-but-otherwise-valid symbol, and
      // a symbol with no classification fields at all. None should be hidden
      // or styled identically; the classified one is the only `type: "entry"`.
      const nodes = [
        ...baseNodes,
        {
          id: "symbol-classified",
          type: "symbol" as const,
          label: "createIndexer",
          filePath: "/workspace/src/index.ts",
          startLine: 2,
          symbolKind: "function" as const,
          entryKind: "public-api" as const,
          archLayer: "unknown" as const,
        },
        {
          id: "symbol-unclassified",
          type: "symbol" as const,
          label: "helper",
          filePath: "/workspace/src/helper.ts",
          startLine: 3,
          symbolKind: "function" as const,
          entryKind: "unclassified" as const,
          archLayer: "unknown" as const,
        },
        {
          id: "symbol-pass1only",
          type: "symbol" as const,
          label: "fallback",
          filePath: "/workspace/src/fallback.ts",
          startLine: 4,
          symbolKind: "function" as const,
          // entryKind and archLayer intentionally omitted: pass-1-only graph.
        },
      ];

      render(
        <GraphView
          nodes={nodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
        />,
      );

      const graph = sigmaConstructor.mock.calls[0]?.[0];
      expect(graph.hasNode("symbol-classified")).toBe(true);
      expect(graph.hasNode("symbol-unclassified")).toBe(true);
      expect(graph.hasNode("symbol-pass1only")).toBe(true);
      expect(graph.getNodeAttribute("symbol-classified", "type")).toBe("entry");
      expect(graph.getNodeAttribute("symbol-unclassified", "type")).toBeUndefined();
      expect(graph.getNodeAttribute("symbol-pass1only", "type")).toBeUndefined();
      expect(graph.getNodeAttribute("symbol-pass1only", "entryKind")).toBeUndefined();
    });
  });

  // Slice 033 Phase 3 — shell wiring: rails + status into the grid.
  describe("shell wiring (slice 033 Phase 3)", () => {
    function renderWired() {
      const result = render(
        <GraphView
          nodes={baseNodes}
          edges={baseEdges}
          onNavigate={vi.fn()}
          onExportMermaid={vi.fn()}
          onExportCurrentView={vi.fn()}
          workspaceName="dextree"
          workspaceFrameworks={["react"]}
        />,
      );
      act(() => {
        vi.runOnlyPendingTimers();
      });
      return result;
    }

    it("renders the shell as a 3-column grid root", () => {
      const { container } = renderWired();
      const shell = container.querySelector('[data-testid="graph-view-shell"]');
      expect(shell).toBeTruthy();
      // The shell root carries the grid module class, not the old flex layout.
      expect(shell?.className.includes("dxt-graph-view")).toBe(false);
    });

    it("renders the toolbar in its own grid area (not inside the canvas surface)", () => {
      const { container } = renderWired();
      const toolbar = screen.getByRole("toolbar", { name: "Graph toolbar" });
      const canvasSurface = container.querySelector('[data-testid="graph-view"]');
      // Toolbar must not be a descendant of the canvas container.
      expect(canvasSurface?.contains(toolbar)).toBe(false);
    });

    it("renders the Node Types filter panel in the left rail", () => {
      renderWired();
      expect(screen.getByTestId("node-filter-panel")).toBeTruthy();
      // Lenses + Node Types coexist in the left rail.
      expect(screen.getByTestId("lens-row-god-class")).toBeTruthy();
    });

    it("renders the Edge Types panel in the right rail", () => {
      renderWired();
      expect(screen.getByTestId("edge-types-panel")).toBeTruthy();
    });

    it("toggling a node-type checkbox does not throw and updates the checkbox", () => {
      renderWired();
      // Class is visible in the default view, so it starts checked.
      const classRow = screen.getByTestId("filter-row-class");
      const checkbox = classRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
      act(() => {
        fireEvent.click(checkbox);
      });
      expect(checkbox.checked).toBe(false);
    });

    it("default view shows only class/function/method/interface nodes and calls/import edges", () => {
      renderWired();

      // Structure-core node kinds are visible (checked) by default.
      for (const key of ["class", "function", "method", "interface"]) {
        const row = screen.queryByTestId(`filter-row-${key}`);
        if (row === null) continue; // row only renders when the kind exists in the graph
        const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
      }

      // Everything else starts hidden (unchecked), incl. file/folder nodes.
      for (const key of ["file", "property", "variable", "enum", "type"]) {
        const row = screen.queryByTestId(`filter-row-${key}`);
        if (row === null) continue;
        const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(checkbox.checked).toBe(false);
      }

      // Calls + Imports edges visible by default; Defines starts hidden.
      const callsRow = screen.getByTestId("edge-row-CALLS");
      expect((callsRow.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
        true,
      );
      const importsRow = screen.getByTestId("edge-row-IMPORTS");
      expect((importsRow.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
        true,
      );
      const definesRow = screen.getByTestId("edge-row-DEFINES");
      expect((definesRow.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
        false,
      );
    });

    it("toggling an edge-type checkbox does not throw and updates the checkbox", () => {
      renderWired();
      const callsRow = screen.getByTestId("edge-row-CALLS");
      const checkbox = callsRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
      act(() => {
        fireEvent.click(checkbox);
      });
      expect(checkbox.checked).toBe(false);
    });

    it("renders a status bar with a right cluster showing the layout name", () => {
      renderWired();
      const statusBar = screen.getByTestId("graph-status-bar");
      expect(statusBar).toBeTruthy();
      expect(within(statusBar).getByText("ForceAtlas2")).toBeTruthy();
    });
  });
});
