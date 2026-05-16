import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./LoadingState.js";

describe("LoadingState", () => {
  it("renders loading message", () => {
    render(<LoadingState />);
    expect(screen.getByText(/indexing/i)).toBeTruthy();
  });

  it("renders the type-hierarchy codicon", () => {
    const { container } = render(<LoadingState />);
    const icon = container.querySelector(".codicon-type-hierarchy");
    expect(icon).toBeTruthy();
  });
});
