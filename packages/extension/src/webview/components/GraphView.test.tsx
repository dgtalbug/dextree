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
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

    expect(screen.getByTestId("graph-view")).toBeTruthy();
    expect(sigmaConstructor).toHaveBeenCalledTimes(1);
    expect(forceAtlasAssign).toHaveBeenCalledTimes(1);
    expect(sigmaConstructor.mock.calls[0]?.[2]).toMatchObject({ allowInvalidContainer: true });
    expect(resizeObservers[0]?.observe).toHaveBeenCalled();
  });

  it("assigns distinct node size and color attributes for file and symbol nodes", () => {
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

    const graph = sigmaConstructor.mock.calls[0]?.[0];

    expect(graph.getNodeAttribute("file-1", "size")).toBe(16);
    expect(graph.getNodeAttribute("symbol-1", "size")).toBe(7);
    expect(graph.getNodeAttribute("file-1", "color")).not.toBe(
      graph.getNodeAttribute("symbol-1", "color"),
    );
  });

  it("seeds numeric coordinates for every node before Sigma initialization", () => {
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

    const graph = sigmaConstructor.mock.calls[0]?.[0];

    expect(Number.isFinite(graph.getNodeAttribute("file-1", "x"))).toBe(true);
    expect(Number.isFinite(graph.getNodeAttribute("file-1", "y"))).toBe(true);
    expect(Number.isFinite(graph.getNodeAttribute("symbol-1", "x"))).toBe(true);
    expect(Number.isFinite(graph.getNodeAttribute("symbol-1", "y"))).toBe(true);
  });

  it("assigns distinct colors for DEFINES, IMPORTS, and CALLS edges", () => {
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

    const graph = sigmaConstructor.mock.calls[0]?.[0];

    const definesColor = graph.getEdgeAttribute("edge-defines", "color");
    const importsColor = graph.getEdgeAttribute("edge-imports", "color");
    const callsColor = graph.getEdgeAttribute("edge-calls", "color");

    expect(definesColor).not.toBe(importsColor);
    expect(importsColor).not.toBe(callsColor);
    expect(definesColor).not.toBe(callsColor);
  });

  it("selects a node on single click without navigating immediately", () => {
    const onNavigate = vi.fn();
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={onNavigate} />);

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
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={onNavigate} />);

    const doubleClickNodeHandler = mockSigma.on.mock.calls.find(
      (call) => call[0] === "doubleClickNode",
    )?.[1];
    doubleClickNodeHandler?.({ node: "file-1" });

    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/app.ts", 1);
  });

  it("re-applies theme-derived colors when the VS Code body class changes", () => {
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);
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

    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

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
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={onNavigate} />);

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
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={onNavigate} />);

    expect(screen.getByTestId("graph-view-fallback")).toBeTruthy();
    expect(screen.getByRole("img", { name: /symbol graph/i })).toBeTruthy();

    const fallbackNode = screen.getByRole("button", { name: "greet" });
    expect(fallbackNode.hasAttribute("style")).toBe(false);

    fireEvent.click(fallbackNode);
    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/app.ts", 6);
  });

  it("registers nodeReducer and edgeReducer Sigma settings", () => {
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

    const settings = sigmaConstructor.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(typeof settings.nodeReducer).toBe("function");
    expect(typeof settings.edgeReducer).toBe("function");
  });

  it("registers enterNode and leaveNode event listeners on Sigma", () => {
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

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

    render(<GraphView nodes={nodesWithImportance} edges={baseEdges} onNavigate={vi.fn()} />);

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
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

    const graph = sigmaConstructor.mock.calls[0]?.[0];

    expect(graph.getNodeAttribute("symbol-1", "size")).toBe(
      graph.getNodeAttribute("symbol-2", "size"),
    );
  });

  it("fades non-neighbor nodes and edges when a node is hovered", () => {
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

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
    expect(String(fadedEdge.color)).toMatch(/rgba?\([^)]*0\.16\)/);

    const leaveNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "leaveNode")?.[1];
    leaveNodeHandler?.({});

    const restoredEdge = settings.edgeReducer("edge-calls", { color: "rgb(255, 170, 90)" });
    expect(restoredEdge.color).toBe("rgb(255, 170, 90)");
  });

  it("emphasizes descendant edges after a node is selected", () => {
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

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
    expect(String(fadedEdge.color)).toMatch(/rgba?\([^)]*0\.16\)/);
  });
});
