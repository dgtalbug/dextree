import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DepthSlider, DEPTH_MAX, DEPTH_MIN } from "./DepthSlider.js";

afterEach(() => cleanup());

describe("DepthSlider", () => {
  it("renders a range input with min=1, max=6, step=1, and the current value", () => {
    render(<DepthSlider depth={3} enabled={true} onDepthChange={vi.fn()} />);
    const range = screen.getByRole("slider") as HTMLInputElement;
    expect(range.type).toBe("range");
    expect(range.min).toBe(String(DEPTH_MIN));
    expect(range.max).toBe(String(DEPTH_MAX));
    expect(range.step).toBe("1");
    expect(range.value).toBe("3");
  });

  it("calls onDepthChange with the new numeric value when the slider moves", () => {
    const onDepthChange = vi.fn();
    render(<DepthSlider depth={3} enabled={true} onDepthChange={onDepthChange} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "5" } });
    expect(onDepthChange).toHaveBeenCalledWith(5);
  });

  it("renders the label with the current depth value", () => {
    render(<DepthSlider depth={4} enabled={true} onDepthChange={vi.fn()} />);
    expect(screen.getByText("Depth: 4")).toBeTruthy();
  });

  it("disables the slider when enabled is false", () => {
    render(<DepthSlider depth={3} enabled={false} onDepthChange={vi.fn()} />);
    expect((screen.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
  });

  it("shows the 'Select a node first' tooltip when disabled", () => {
    const { container } = render(<DepthSlider depth={3} enabled={false} onDepthChange={vi.fn()} />);
    const label = container.querySelector("label");
    expect(label?.getAttribute("title")).toBe("Select a node first");
  });
});
