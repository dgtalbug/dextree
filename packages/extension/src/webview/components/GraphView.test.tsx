import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { forceAtlasAssign, mutationObservers, mockSigma, sigmaConstructor } = vi.hoisted(() => {
  const mutationObservers: Array<{ callback: (...args: unknown[]) => void }> = [];

  const mockSigma = {
    setSetting: vi.fn(),
    on: vi.fn(),
    kill: vi.fn(),
    refresh: vi.fn(),
  };

  const sigmaConstructor = vi.fn((_graph, _container, _settings) => mockSigma);
  const forceAtlasAssign = vi.fn();

  return {
    forceAtlasAssign,
    mutationObservers,
    mockSigma,
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

import { GraphView } from "./GraphView.js";

afterEach(() => {
  cleanup();
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
  },
  {
    id: "symbol-2",
    type: "symbol" as const,
    label: "formatDate",
    filePath: "/workspace/src/util.ts",
    startLine: 4,
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
      "--vscode-symbolIcon-classForeground": "rgb(180, 80, 40)",
      "--vscode-charts-blue": "rgb(80, 140, 255)",
      "--vscode-charts-green": "rgb(50, 160, 90)",
      "--vscode-charts-orange": "rgb(220, 120, 40)",
    };
  }

  return {
    "--vscode-editor-background": "rgb(30, 30, 30)",
    "--vscode-foreground": "rgb(220, 220, 220)",
    "--vscode-symbolIcon-fileForeground": "rgb(120, 160, 255)",
    "--vscode-symbolIcon-classForeground": "rgb(255, 180, 120)",
    "--vscode-charts-blue": "rgb(100, 170, 255)",
    "--vscode-charts-green": "rgb(90, 200, 140)",
    "--vscode-charts-orange": "rgb(255, 170, 90)",
  };
}

describe("GraphView", () => {
  beforeEach(() => {
    document.body.className = "vscode-dark";
    mutationObservers.length = 0;
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

  it("renders the graph container and initializes Sigma", () => {
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

    expect(screen.getByTestId("graph-view")).toBeTruthy();
    expect(sigmaConstructor).toHaveBeenCalledTimes(1);
    expect(forceAtlasAssign).toHaveBeenCalledTimes(1);
  });

  it("assigns distinct node size and color attributes for file and symbol nodes", () => {
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={vi.fn()} />);

    const graph = sigmaConstructor.mock.calls[0]?.[0];

    expect(graph.getNodeAttribute("file-1", "size")).toBe(12);
    expect(graph.getNodeAttribute("symbol-1", "size")).toBe(6);
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

  it("calls onNavigate with the node file path and line when a symbol node is clicked", () => {
    const onNavigate = vi.fn();
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={onNavigate} />);

    const clickNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "clickNode")?.[1];
    clickNodeHandler?.({ node: "symbol-1" });

    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/app.ts", 6);
  });

  it("calls onNavigate with line 1 when a file node is clicked", () => {
    const onNavigate = vi.fn();
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={onNavigate} />);

    const clickNodeHandler = mockSigma.on.mock.calls.find((call) => call[0] === "clickNode")?.[1];
    clickNodeHandler?.({ node: "file-1" });

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

  it("falls back to a simplified graph preview when Sigma fails to initialize", () => {
    sigmaConstructor.mockImplementationOnce(() => {
      throw new Error("webgl unavailable");
    });

    const onNavigate = vi.fn();
    render(<GraphView nodes={baseNodes} edges={baseEdges} onNavigate={onNavigate} />);

    expect(screen.getByTestId("graph-view-fallback")).toBeTruthy();
    expect(screen.getByText(/simplified graph preview/i)).toBeTruthy();

    screen.getByRole("button", { name: "greet" }).click();
    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/app.ts", 6);
  });
});
