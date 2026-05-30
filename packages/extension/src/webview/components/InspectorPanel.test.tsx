import type { GraphNode } from "@dextree/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BADGE_SEPARATOR,
  INSPECTOR_BADGE_KEYS,
  IMPORTANCE_NEAR_ZERO_THRESHOLD,
  InspectorPanel,
} from "./InspectorPanel.js";

function symbolNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "sym-1",
    type: "symbol",
    label: "doThing",
    filePath: "/workspace/src/example.ts",
    startLine: 12,
    symbolKind: "function",
    importance: 0.123,
    framework: "react",
    frameworkRole: "component",
    visibility: "public",
    signature: "function doThing(x: number): string",
    docstring: "Doubles x and stringifies",
    ...overrides,
  };
}

describe("InspectorPanel", () => {
  afterEach(() => cleanup());

  it("renders empty state when no node is selected", () => {
    render(<InspectorPanel selectedNode={null} />);

    expect(screen.getByText("Select a node to inspect")).toBeTruthy();
  });

  it("renders label / filepath / badges for a symbol node", () => {
    const { container } = render(<InspectorPanel selectedNode={symbolNode()} />);

    expect(screen.getByText("doThing")).toBeTruthy();
    expect(container.textContent).toContain("/workspace/src/example.ts");
    const badges = container.querySelectorAll('[data-testid^="badge-"]');
    expect(badges.length).toBe(5);
  });

  it("renders signature and docstring when available", () => {
    const { container } = render(<InspectorPanel selectedNode={symbolNode()} />);

    expect(container.querySelector('[data-testid="inspector-signature"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="inspector-docstring"]')).toBeTruthy();
  });

  it("badge row order matches INSPECTOR_BADGE_KEYS", () => {
    const { container } = render(<InspectorPanel selectedNode={symbolNode()} />);

    const badgeEls = Array.from(container.querySelectorAll('[data-testid^="badge-"]'));
    const keys = badgeEls.map((el) => el.getAttribute("data-testid")?.replace("badge-", ""));
    expect(keys).toEqual([...INSPECTOR_BADGE_KEYS]);
  });

  it("renders 5 badges for selected node", () => {
    const { container, rerender } = render(<InspectorPanel selectedNode={null} />);

    rerender(<InspectorPanel selectedNode={symbolNode()} />);
    const populatedChildren = container.querySelectorAll('[data-testid^="badge-"]');
    expect(populatedChildren.length).toBe(5);
  });

  it("formats importance at threshold boundary", () => {
    const { container } = render(
      <InspectorPanel selectedNode={symbolNode({ importance: IMPORTANCE_NEAR_ZERO_THRESHOLD })} />,
    );
    expect(container.querySelector('[data-testid="badge-importance"]')?.textContent).toBe("0.001");
  });

  it("formats importance below threshold as ≈ 0", () => {
    const { container } = render(
      <InspectorPanel selectedNode={symbolNode({ importance: 0.0004 })} />,
    );
    expect(container.querySelector('[data-testid="badge-importance"]')?.textContent).toBe("≈ 0");
  });

  it("joins framework and frameworkRole with separator", () => {
    const { container } = render(<InspectorPanel selectedNode={symbolNode()} />);
    const badge = container.querySelector('[data-testid="badge-framework"]');
    expect(badge?.textContent).toBe(`react${BADGE_SEPARATOR}component`);
  });

  it("renders framework name without separator when frameworkRole is undefined", () => {
    const { container } = render(
      <InspectorPanel
        selectedNode={symbolNode({ framework: "django", frameworkRole: undefined })}
      />,
    );
    const badge = container.querySelector('[data-testid="badge-framework"]');
    expect(badge?.textContent).toBe("django");
  });

  it("renders Trace from here when onTraceFromHere provided", () => {
    render(<InspectorPanel selectedNode={symbolNode()} onTraceFromHere={vi.fn()} />);
    expect(screen.getByTestId("trace-from-here")).toBeTruthy();
  });

  it("renders Export button always when node is selected", () => {
    render(<InspectorPanel selectedNode={symbolNode()} />);
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("calls onTraceFromHere with node id when clicked", () => {
    const onTraceFromHere = vi.fn();
    render(<InspectorPanel selectedNode={symbolNode()} onTraceFromHere={onTraceFromHere} />);
    screen.getByTestId("trace-from-here").click();
    expect(onTraceFromHere).toHaveBeenCalledWith("sym-1");
  });

  describe("neighbor lists", () => {
    const sampleNeighbors = {
      calledBy: [{ id: "n1", label: "caller1", filePath: "src/a.ts", symbolKind: "function" }],
      calls: [{ id: "n2", label: "callee1", filePath: "src/b.ts", symbolKind: "method" }],
      implements: [
        { id: "n3", label: "IRepository", filePath: "src/types.ts", symbolKind: "interface" },
      ],
    };

    it("renders neighbor group titles with counts", () => {
      render(<InspectorPanel selectedNode={symbolNode()} neighbors={sampleNeighbors} />);

      expect(screen.getByText(/Called by/)).toBeTruthy();
      expect(screen.getByText(/Calls/)).toBeTruthy();
      expect(screen.getByText(/Implements/)).toBeTruthy();
    });

    it("renders neighbor rows with name and file path", () => {
      render(<InspectorPanel selectedNode={symbolNode()} neighbors={sampleNeighbors} />);

      expect(screen.getByText("caller1")).toBeTruthy();
      expect(screen.getByText("callee1")).toBeTruthy();
      expect(screen.getByText("IRepository")).toBeTruthy();
      expect(screen.getByTestId("neighbor-row-n1")).toBeTruthy();
    });
  });
});
