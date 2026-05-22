import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./LoadingState.js";

describe("LoadingState", () => {
  it("renders loading message", () => {
    render(<LoadingState />);
    expect(screen.getByText(/indexing/i)).toBeTruthy();
  });

  it("renders a custom label when provided", () => {
    render(<LoadingState label="Building graph..." />);
    expect(screen.getByText("Building graph...")).toBeTruthy();
  });

  it("renders live indexing progress details when provided", () => {
    render(
      <LoadingState
        indexing={{
          type: "indexing",
          phase: "progress",
          current: 2,
          total: 5,
          fileName: "graph.ts",
          failed: 1,
          cancelled: false,
          status: "failed",
        }}
      />,
    );

    expect(screen.getByText("graph.ts")).toBeTruthy();
    expect(screen.getByText("2 / 5 · 1 failed")).toBeTruthy();
  });
});
