import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState.js";

afterEach(() => {
  cleanup();
});

describe("EmptyState", () => {
  it("renders empty state message", () => {
    render(<EmptyState />);
    expect(screen.getByText(/no symbols/i)).toBeTruthy();
  });

  it("renders a hint to index files", () => {
    render(<EmptyState />);
    expect(screen.getAllByText(/index/i).length).toBeGreaterThan(0);
  });

  it("renders a graph preview so the empty tab is still informative", () => {
    render(<EmptyState />);
    expect(screen.getByLabelText(/graph preview/i)).toBeTruthy();
    expect(screen.getByText(/files connect to symbols/i)).toBeTruthy();
  });
});
