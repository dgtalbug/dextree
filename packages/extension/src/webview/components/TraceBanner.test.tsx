import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TraceBanner } from "./TraceBanner.js";
import { TRACE_STATE_IDLE } from "./graphViewTypes.js";

afterEach(() => cleanup());

describe("TraceBanner", () => {
  it("renders the 'click a start node' hint when phase is picking-start", () => {
    render(
      <TraceBanner
        state={{ ...TRACE_STATE_IDLE, phase: "picking-start" }}
        startLabel={null}
        endLabel={null}
        onExit={vi.fn()}
      />,
    );
    expect(screen.getByText(/click a start node/i)).toBeTruthy();
  });

  it("renders the 'click an end node' hint with start label when phase is picking-end", () => {
    render(
      <TraceBanner
        state={{ ...TRACE_STATE_IDLE, phase: "picking-end", startNodeId: "n1" }}
        startLabel="parseManifest"
        endLabel={null}
        onExit={vi.fn()}
      />,
    );
    expect(screen.getByText(/parseManifest/)).toBeTruthy();
    expect(screen.getByText(/click an end node/i)).toBeTruthy();
  });

  it("renders the hop count summary when phase is path-active with a path", () => {
    render(
      <TraceBanner
        state={{
          phase: "path-active",
          startNodeId: "n1",
          endNodeId: "n3",
          pathNodeIds: ["n1", "n2", "n3"],
          pathEdgeIds: ["e1", "e2"],
          noPathFound: false,
          selfTraceError: false,
        }}
        startLabel="parseManifest"
        endLabel="writeOutput"
        onExit={vi.fn()}
      />,
    );
    expect(screen.getByText(/parseManifest/)).toBeTruthy();
    expect(screen.getByText(/writeOutput/)).toBeTruthy();
    expect(screen.getByText(/2 hops/i)).toBeTruthy();
    expect(screen.getByText(/shortest path/i)).toBeTruthy();
  });

  it("renders 'no path found' when noPathFound is true", () => {
    render(
      <TraceBanner
        state={{
          phase: "path-active",
          startNodeId: "n1",
          endNodeId: "n9",
          pathNodeIds: [],
          pathEdgeIds: [],
          noPathFound: true,
          selfTraceError: false,
        }}
        startLabel="parseManifest"
        endLabel="orphan"
        onExit={vi.fn()}
      />,
    );
    expect(screen.getByText(/no path found/i)).toBeTruthy();
  });

  it("renders the self-trace error message when selfTraceError is true", () => {
    render(
      <TraceBanner
        state={{
          ...TRACE_STATE_IDLE,
          phase: "picking-end",
          startNodeId: "n1",
          selfTraceError: true,
        }}
        startLabel="parseManifest"
        endLabel={null}
        onExit={vi.fn()}
      />,
    );
    expect(screen.getByText(/must be different/i)).toBeTruthy();
  });

  it("calls onExit when the exit button is clicked", () => {
    const onExit = vi.fn();
    render(
      <TraceBanner
        state={{ ...TRACE_STATE_IDLE, phase: "picking-start" }}
        startLabel={null}
        endLabel={null}
        onExit={onExit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /exit trace/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
