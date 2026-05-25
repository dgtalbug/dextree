import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./components/GraphView.js", () => ({
  GraphView: ({
    nodes,
    edges,
    onNavigate,
    workspaceName,
    workspaceFrameworks,
    onWorkspaceSwitcherClick,
  }: {
    nodes: { filePath: string; startLine: number }[];
    edges: unknown[];
    onNavigate: (filePath: string, line: number) => void;
    workspaceName?: string;
    workspaceFrameworks?: readonly string[];
    onWorkspaceSwitcherClick?: () => void;
  }) => (
    <>
      <button
        type="button"
        data-testid="graph-view"
        onClick={() => onNavigate(nodes[0]?.filePath ?? "", nodes[0]?.startLine ?? 0)}
      >
        {`graph:${nodes.length}:${edges.length}`}
      </button>
      <div data-testid="ws-name">{workspaceName ?? ""}</div>
      <div data-testid="ws-frameworks">{(workspaceFrameworks ?? []).join(",")}</div>
      <button
        type="button"
        data-testid="ws-switcher-click"
        onClick={() => onWorkspaceSwitcherClick?.()}
      >
        switch
      </button>
    </>
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
    expect(screen.getAllByText("app.ts").length).toBeGreaterThan(0);
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

  it("posts command messages when panel action buttons are clicked", () => {
    render(<App vscodeApi={vscodeApi} />);
    vscodeApi.postMessage.mockClear();

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: mockGraphMessage }));
    });

    // "Clear Workspace" button should dispatch a command
    const clearBtn = screen.getByTitle("Clear the current workspace index");
    fireEvent.click(clearBtn);

    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      type: "command",
      command: "clear-workspace",
    });
  });

  describe("legend rendering (US3 FR-010)", () => {
    it("shows DEFINES and IMPORTS as fallback when presentEdgeKinds is empty", () => {
      render(<App vscodeApi={vscodeApi} />);
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { ...mockGraphMessage, presentEdgeKinds: [] },
          }),
        );
      });
      expect(screen.getByText("DEFINES")).toBeTruthy();
      expect(screen.getByText("IMPORTS")).toBeTruthy();
    });

    it("renders exactly the provided edge kinds when presentEdgeKinds is non-empty", () => {
      render(<App vscodeApi={vscodeApi} />);
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { ...mockGraphMessage, presentEdgeKinds: ["DEFINES", "CALLS"] },
          }),
        );
      });
      expect(screen.getByText("DEFINES")).toBeTruthy();
      expect(screen.getByText("CALLS")).toBeTruthy();
    });

    it("renders a custom pill with dxt-legend-pill-custom class for CUSTOM_* kinds", () => {
      render(<App vscodeApi={vscodeApi} />);
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { ...mockGraphMessage, presentEdgeKinds: ["CUSTOM_FOO"] },
          }),
        );
      });
      expect(screen.getByText("CUSTOM_FOO")).toBeTruthy();
      const pill = document.querySelector(".dxt-legend-pill-custom");
      expect(pill).toBeTruthy();
    });
  });

  describe("workspace context (slice 024 US1)", () => {
    it("captures workspaceName and workspaceFrameworks from a graph message and passes them down", () => {
      render(<App vscodeApi={vscodeApi} />);

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              ...mockGraphMessage,
              workspaceName: "dextree",
              workspaceFrameworks: ["react", "vitest"],
            },
          }),
        );
      });

      expect(screen.getByTestId("ws-name").textContent).toBe("dextree");
      expect(screen.getByTestId("ws-frameworks").textContent).toBe("react,vitest");
    });

    it("does not set workspace context when graph message omits workspaceName", () => {
      render(<App vscodeApi={vscodeApi} />);

      act(() => {
        window.dispatchEvent(new MessageEvent("message", { data: mockGraphMessage }));
      });

      expect(screen.getByTestId("ws-name").textContent).toBe("");
      expect(screen.getByTestId("ws-frameworks").textContent).toBe("");
    });

    it("preserves workspace context across subsequent graph messages that omit it", () => {
      render(<App vscodeApi={vscodeApi} />);

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              ...mockGraphMessage,
              workspaceName: "dextree",
              workspaceFrameworks: ["react"],
            },
          }),
        );
      });
      expect(screen.getByTestId("ws-name").textContent).toBe("dextree");

      act(() => {
        window.dispatchEvent(new MessageEvent("message", { data: mockGraphMessage }));
      });
      expect(screen.getByTestId("ws-name").textContent).toBe("dextree");
      expect(screen.getByTestId("ws-frameworks").textContent).toBe("react");
    });
  });

  describe("workspaces scene (slice 024 US2)", () => {
    it("posts requestWorkspaceList and shows the Workspaces page when the switcher is clicked", () => {
      render(<App vscodeApi={vscodeApi} />);

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { ...mockGraphMessage, workspaceName: "dextree", workspaceFrameworks: [] },
          }),
        );
      });

      vscodeApi.postMessage.mockClear();

      act(() => {
        fireEvent.click(screen.getByTestId("ws-switcher-click"));
      });

      expect(vscodeApi.postMessage).toHaveBeenCalledWith({ type: "requestWorkspaceList" });
      expect(screen.getByTestId("workspaces-page")).toBeTruthy();
      expect(screen.getByText(/Loading workspaces/)).toBeTruthy();
    });

    function enterWorkspacesScene() {
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { ...mockGraphMessage, workspaceName: "dextree", workspaceFrameworks: [] },
          }),
        );
      });
      act(() => {
        fireEvent.click(screen.getByTestId("ws-switcher-click"));
      });
    }

    const sampleList = [
      {
        workspaceRoot: "/a/dextree",
        name: "dextree",
        indexedFileCount: 1,
        graphNodeCount: 2,
        graphEdgeCount: 3,
        lastIndexedAt: null,
        frameworks: [] as string[],
        isActive: true,
      },
      {
        workspaceRoot: "/b/widgets",
        name: "widgets",
        indexedFileCount: 0,
        graphNodeCount: 0,
        graphEdgeCount: 0,
        lastIndexedAt: null,
        frameworks: [] as string[],
        isActive: false,
      },
    ];

    it("renders workspace cards once the host posts workspaceList", () => {
      render(<App vscodeApi={vscodeApi} />);
      enterWorkspacesScene();

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { type: "workspaceList", workspaces: sampleList },
          }),
        );
      });

      expect(screen.getAllByTestId("workspace-card").length).toBe(2);
    });

    it("posts switchWorkspace and returns to graph when a non-active card is clicked", () => {
      render(<App vscodeApi={vscodeApi} />);
      enterWorkspacesScene();

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { type: "workspaceList", workspaces: sampleList },
          }),
        );
      });

      vscodeApi.postMessage.mockClear();

      act(() => {
        const cards = screen.getAllByTestId("workspace-card");
        fireEvent.click(cards[1]!);
      });

      expect(vscodeApi.postMessage).toHaveBeenCalledWith({
        type: "switchWorkspace",
        workspaceRoot: "/b/widgets",
      });
      expect(screen.queryByTestId("workspaces-page")).toBeNull();
    });

    it("returns to the graph when the back button is clicked", () => {
      render(<App vscodeApi={vscodeApi} />);
      enterWorkspacesScene();

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Back to graph" }));
      });

      expect(screen.queryByTestId("workspaces-page")).toBeNull();
    });

    it("resets the scene to graph when a new graph message arrives", () => {
      render(<App vscodeApi={vscodeApi} />);
      enterWorkspacesScene();

      expect(screen.getByTestId("workspaces-page")).toBeTruthy();

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { ...mockGraphMessage, workspaceName: "widgets" },
          }),
        );
      });

      expect(screen.queryByTestId("workspaces-page")).toBeNull();
    });
  });
});
