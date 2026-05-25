import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TraceInspector } from "./TraceInspector.js";
import type { TracePath } from "./graphViewTypes.js";

const samplePath: TracePath = {
  startNodeId: "n1",
  endNodeId: "n3",
  hopCount: 2,
  fileCount: 2,
  layersCrossed: ["entry", "domain"],
  crossesFrameworkBoundary: false,
  nodeIds: ["n1", "n2", "n3"],
  edgeIds: ["e1", "e2"],
};

afterEach(() => cleanup());

describe("TraceInspector", () => {
  it("renders the Trace details header", () => {
    render(
      <TraceInspector
        tracePath={samplePath}
        noPathFound={false}
        startLabel="start"
        endLabel="end"
        onStepClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/trace details/i)).toBeTruthy();
  });

  it("shows the hop count and file count summary", () => {
    render(
      <TraceInspector
        tracePath={samplePath}
        noPathFound={false}
        startLabel="parseManifest"
        endLabel="writeOutput"
        onStepClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 hops/i)).toBeTruthy();
    expect(screen.getByText(/2 files/i)).toBeTruthy();
  });

  it("renders layers crossed when layersCrossed is non-empty", () => {
    render(
      <TraceInspector
        tracePath={samplePath}
        noPathFound={false}
        startLabel="start"
        endLabel="end"
        onStepClick={vi.fn()}
      />,
    );
    expect(screen.getByText("entry")).toBeTruthy();
    expect(screen.getByText("domain")).toBeTruthy();
  });

  it("renders gracefully when layersCrossed is empty", () => {
    render(
      <TraceInspector
        tracePath={{ ...samplePath, layersCrossed: [] }}
        noPathFound={false}
        startLabel="start"
        endLabel="end"
        onStepClick={vi.fn()}
      />,
    );
    // No throw + no layer rows
    expect(screen.queryByText(/entry/i)).toBeNull();
  });

  it("renders the framework boundary badge when crossesFrameworkBoundary is true", () => {
    render(
      <TraceInspector
        tracePath={{ ...samplePath, crossesFrameworkBoundary: true }}
        noPathFound={false}
        startLabel="start"
        endLabel="end"
        onStepClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/framework boundary/i)).toBeTruthy();
  });

  it("renders the disabled 'Show all paths' button with tooltip", () => {
    render(
      <TraceInspector
        tracePath={samplePath}
        noPathFound={false}
        startLabel="start"
        endLabel="end"
        onStepClick={vi.fn()}
      />,
    );
    const showAllPaths = screen.getByRole("button", { name: /show all paths/i });
    expect((showAllPaths as HTMLButtonElement).disabled).toBe(true);
    expect(showAllPaths.getAttribute("title")).toMatch(/future release|deferred/i);
  });

  it("renders the no-path-found state when noPathFound is true", () => {
    render(
      <TraceInspector
        tracePath={null}
        noPathFound={true}
        startLabel="start"
        endLabel="orphan"
        onStepClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/no path found/i)).toBeTruthy();
  });

  it("calls onStepClick with the node id when a step row is clicked", () => {
    const onStepClick = vi.fn();
    render(
      <TraceInspector
        tracePath={samplePath}
        noPathFound={false}
        startLabel="start"
        endLabel="end"
        onStepClick={onStepClick}
      />,
    );
    const stepRows = screen.getAllByTestId(/^trace-step-/);
    expect(stepRows.length).toBe(3);
    fireEvent.click(stepRows[1]!);
    expect(onStepClick).toHaveBeenCalledWith("n2");
  });
});
