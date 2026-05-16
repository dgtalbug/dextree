import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState.js";

describe("EmptyState", () => {
  it("renders empty state message", () => {
    render(<EmptyState />);
    expect(screen.getByText(/no symbols/i)).toBeTruthy();
  });

  it("renders a hint to index files", () => {
    render(<EmptyState />);
    expect(screen.getAllByText(/index/i).length).toBeGreaterThan(0);
  });
});
