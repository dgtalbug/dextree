import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./components/GraphView.js", () => ({
  GraphView: ({
    nodes,
    edges,
    onNavigate,
  }: {
    nodes: { filePath: string; startLine: number }[];
    edges: unknown[];
    onNavigate: (filePath: string, line: number) => void;
  }) => (
    <button
      type="button"
      data-testid="graph-view"
      onClick={() => onNavigate(nodes[0]?.filePath ?? "", nodes[0]?.startLine ?? 0)}
    >
      {`graph:${nodes.length}:${edges.length}`}
    </button>
  ),
}));

import { App } from "./App.js";

const mockGraphMessage = {
  type: "graph" as const,
  nodes: [
    {
      id: "symbol-1",
      type: "symbol" as const,
      label: "greet",
      filePath: "/workspace/src/app.ts",
      startLine: 6,
    },
  ],
  edges: [],
};

describe("App", () => {
  const vscodeApi = {
    postMessage: vi.fn(),
  };

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vscodeApi.postMessage.mockClear();
  });

  it("posts a ready message on mount and shows the graph loading label", () => {
    render(<App vscodeApi={vscodeApi} />);

    expect(vscodeApi.postMessage).toHaveBeenCalledWith({ type: "ready" });
    expect(screen.getByText("Building graph…")).toBeTruthy();
    expect(screen.getByTestId("graph-scaffold")).toBeTruthy();
  });

  it("shows the empty state when the host posts an empty graph", () => {
    render(<App vscodeApi={vscodeApi} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "graph", nodes: [], edges: [] },
        }),
      );
    });

    expect(screen.getByText(/No symbols indexed yet/i)).toBeTruthy();
  });

  it("renders GraphView when the host posts graph data", () => {
    render(<App vscodeApi={vscodeApi} />);

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: mockGraphMessage }));
    });

    expect(screen.getByTestId("graph-view").textContent).toBe("graph:1:0");
  });

  it("keeps the cached graph visible while indexing is in progress", () => {
    render(<App vscodeApi={vscodeApi} />);

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: mockGraphMessage }));
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "indexing",
            phase: "progress",
            current: 1,
            total: 4,
            fileName: "app.ts",
            failed: 0,
            cancelled: false,
            status: "indexing",
          },
        }),
      );
    });

    expect(screen.getByTestId("graph-view").textContent).toBe("graph:1:0");
    expect(screen.getByText("app.ts")).toBeTruthy();
    expect(screen.getByText("1 / 4")).toBeTruthy();
  });

  it("clears the overlay when indexing finishes without waiting for another graph message", () => {
    render(<App vscodeApi={vscodeApi} />);

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: mockGraphMessage }));
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "indexing",
            phase: "progress",
            current: 3,
            total: 4,
            fileName: "app.ts",
            failed: 0,
            cancelled: false,
            status: "indexing",
          },
        }),
      );
    });

    expect(screen.getByText("3 / 4")).toBeTruthy();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "indexing",
            phase: "finished",
            current: 4,
            total: 4,
            fileName: "app.ts",
            failed: 0,
            cancelled: false,
            status: "completed",
          },
        }),
      );
    });

    expect(screen.queryByText("3 / 4")).toBeNull();
    expect(screen.getByTestId("graph-view").textContent).toBe("graph:1:0");
  });

  it("posts navigate messages when GraphView requests navigation", () => {
    render(<App vscodeApi={vscodeApi} />);
    vscodeApi.postMessage.mockClear();

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: mockGraphMessage }));
    });
    fireEvent.click(screen.getByTestId("graph-view"));

    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      type: "navigate",
      filePath: "/workspace/src/app.ts",
      line: 6,
    });
  });
});
