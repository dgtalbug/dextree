import type { GraphNode } from "@dextree/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  BADGE_SEPARATOR,
  INSPECTOR_BADGE_KEYS,
  IMPORTANCE_NEAR_ZERO_THRESHOLD,
  InspectorPanel,
} from "./InspectorPanel.js";

function fileNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "file-1",
    type: "file",
    label: "src/example.ts",
    filePath: "/workspace/src/example.ts",
    startLine: 1,
    ...overrides,
  };
}

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
    fanIn: 7,
    isCore: true,
    flags: ["hot-path"],
    signature: "function doThing(x: number): string",
    docstring: "Doubles x and stringifies",
    ...overrides,
  };
}

describe("InspectorPanel", () => {
  afterEach(() => cleanup());

  // (1) Empty state when selectedNode === null
  it("renders empty-state heading and a 4-slot skeleton when no node is selected", () => {
    const { container } = render(<InspectorPanel selectedNode={null} />);

    expect(screen.getByText("Select a node to inspect")).toBeTruthy();
    const skeletons = container.querySelectorAll('[data-testid="badge-skeleton"]');
    expect(skeletons.length).toBe(4);
  });

  // (2) Populated state for a file node
  it("renders label / kind / filepath / badges for a file node", () => {
    const { container } = render(
      <InspectorPanel selectedNode={fileNode({ framework: "vscode-extension" })} />,
    );

    expect(screen.getByText("src/example.ts")).toBeTruthy();
    expect(screen.getByText("file")).toBeTruthy();
    expect(container.textContent).toContain("/workspace/src/example.ts");
    // Files have no signature/docstring — both rows show "—"
    const badges = container.querySelectorAll('[data-testid^="badge-"]');
    expect(badges.length).toBe(4);
  });

  // (3) Populated state for a symbol node with signature + docstring
  it("renders signature in monospace and docstring with line breaks preserved", () => {
    const { container } = render(<InspectorPanel selectedNode={symbolNode()} />);

    expect(screen.getByText("doThing")).toBeTruthy();
    // Symbol kind sub-type rendered alongside type
    expect(container.textContent).toContain("function");
    expect(container.textContent).toContain("function doThing(x: number): string");
    expect(container.textContent).toContain("Doubles x and stringifies");
  });

  // (4) Badge row order matches INSPECTOR_BADGE_KEYS
  it("renders badges in INSPECTOR_BADGE_KEYS order", () => {
    const { container } = render(<InspectorPanel selectedNode={symbolNode()} />);

    const badgeEls = Array.from(container.querySelectorAll('[data-testid^="badge-"]'));
    const keys = badgeEls.map((el) => el.getAttribute("data-testid")?.replace("badge-", ""));
    expect(keys).toEqual([...INSPECTOR_BADGE_KEYS]);
  });

  // (5) layer + entry badges always render "—"
  it('always renders "—" for layer and entry badges (FR-006 stubs)', () => {
    const { container } = render(<InspectorPanel selectedNode={symbolNode()} />);

    const layer = container.querySelector('[data-testid="badge-layer"]');
    const entry = container.querySelector('[data-testid="badge-entry"]');
    expect(layer?.textContent).toBe("—");
    expect(entry?.textContent).toBe("—");
  });

  // (6) Updates within React's render cycle on prop change
  it("re-renders synchronously when selectedNode changes", () => {
    const { rerender, container } = render(<InspectorPanel selectedNode={null} />);
    expect(screen.getByText("Select a node to inspect")).toBeTruthy();

    rerender(<InspectorPanel selectedNode={symbolNode({ label: "fresh" })} />);
    expect(container.textContent).toContain("fresh");
    expect(container.textContent).not.toContain("Select a node to inspect");
  });

  // (7) Geometry stability: badge-row always has 4 children
  it("renders exactly 4 elements in the badge row regardless of selection state (FR-006/C2)", () => {
    const { container, rerender } = render(<InspectorPanel selectedNode={null} />);
    const emptyChildren = container.querySelectorAll('[data-testid="badge-skeleton"]');
    expect(emptyChildren.length).toBe(4);

    rerender(<InspectorPanel selectedNode={fileNode()} />);
    const populatedChildren = container.querySelectorAll('[data-testid^="badge-"]');
    expect(populatedChildren.length).toBe(4);
  });

  // (8) Importance boundary at IMPORTANCE_NEAR_ZERO_THRESHOLD
  it('formats importance at the threshold boundary as toFixed(3), and "≈ 0" below it', () => {
    const atBoundary = render(
      <InspectorPanel selectedNode={symbolNode({ importance: IMPORTANCE_NEAR_ZERO_THRESHOLD })} />,
    );
    expect(
      atBoundary.container.querySelector('[data-testid="badge-importance"]')?.textContent,
    ).toBe("0.001");
    atBoundary.unmount();

    const belowBoundary = render(
      <InspectorPanel selectedNode={symbolNode({ importance: 0.0004 })} />,
    );
    expect(
      belowBoundary.container.querySelector('[data-testid="badge-importance"]')?.textContent,
    ).toBe("≈ 0");
  });

  // (9) Framework separator uses BADGE_SEPARATOR constant, not a hardcoded literal
  it("joins framework and frameworkRole with BADGE_SEPARATOR (A1)", () => {
    const { container } = render(<InspectorPanel selectedNode={symbolNode()} />);

    const badge = container.querySelector('[data-testid="badge-framework"]');
    expect(badge?.textContent).toBe(`react${BADGE_SEPARATOR}component`);
  });

  // (10) Framework badge shows name alone when frameworkRole is undefined
  it("renders framework name without trailing separator when frameworkRole is undefined", () => {
    const { container } = render(
      <InspectorPanel
        selectedNode={symbolNode({ framework: "django", frameworkRole: undefined })}
      />,
    );

    const badge = container.querySelector('[data-testid="badge-framework"]');
    expect(badge?.textContent).toBe("django");
    expect(badge?.textContent?.endsWith(BADGE_SEPARATOR)).toBe(false);
  });

  // Bonus: undefined framework + undefined frameworkRole → "—"
  it('renders "—" when both framework and frameworkRole are undefined', () => {
    const { container } = render(
      <InspectorPanel
        selectedNode={symbolNode({ framework: undefined, frameworkRole: undefined })}
      />,
    );
    const badge = container.querySelector('[data-testid="badge-framework"]');
    expect(badge?.textContent).toBe("—");
  });

  // Bonus: importance undefined → "—"
  it('renders "—" for importance when undefined', () => {
    const { container } = render(
      <InspectorPanel selectedNode={symbolNode({ importance: undefined })} />,
    );
    const badge = container.querySelector('[data-testid="badge-importance"]');
    expect(badge?.textContent).toBe("—");
  });
});
