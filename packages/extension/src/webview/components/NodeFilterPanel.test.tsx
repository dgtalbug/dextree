import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CANONICAL_NODE_FILTER_LIST, NodeFilterPanel } from "./NodeFilterPanel.js";
import type { NodeFilterEntry } from "./NodeFilterPanel.js";

function makeEntries(overrides: Partial<NodeFilterEntry>[] = []): NodeFilterEntry[] {
  return CANONICAL_NODE_FILTER_LIST.map((template, i) => ({
    ...template,
    count: 10 + i,
    ...(overrides[i] ?? {}),
  }));
}

describe("NodeFilterPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all chips from entries", () => {
    render(<NodeFilterPanel entries={makeEntries()} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByRole("group", { name: "Node type filters" })).toBeTruthy();
    // 9 active + 1 disabled = 10 chips rendered
    expect(screen.getAllByRole("checkbox").length).toBe(10);
  });

  it("renders chip with label and count badge", () => {
    const entries: NodeFilterEntry[] = [{ key: "class", label: "Class", count: 14 }];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: "Hide Class nodes" })).toBeTruthy();
    expect(screen.getByLabelText("14 nodes")).toBeTruthy();
  });

  it("active chip has aria-checked=true", () => {
    const entries: NodeFilterEntry[] = [{ key: "class", label: "Class", count: 5 }];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  });

  it("hidden chip has aria-checked=false", () => {
    const entries: NodeFilterEntry[] = [{ key: "class", label: "Class", count: 5 }];

    render(
      <NodeFilterPanel entries={entries} hiddenKinds={new Set(["class"])} onToggle={vi.fn()} />,
    );

    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
  });

  it("clicking active chip calls onToggle with the key", () => {
    const onToggle = vi.fn();
    const entries: NodeFilterEntry[] = [{ key: "class", label: "Class", count: 5 }];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Hide Class nodes" }));

    expect(onToggle).toHaveBeenCalledWith("class");
  });

  it("clicking disabled Decorator chip does NOT call onToggle", () => {
    const onToggle = vi.fn();
    const entries: NodeFilterEntry[] = [
      {
        key: "decorator",
        label: "Decorator",
        count: 0,
        disabled: true,
        tooltip: "Available when DecoratorExtractor ships (slice 031)",
      },
    ];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("disabled chip has aria-disabled=true and shows tooltip", () => {
    const tooltip = "Available when DecoratorExtractor ships (slice 031)";
    const entries: NodeFilterEntry[] = [
      { key: "decorator", label: "Decorator", count: 0, disabled: true, tooltip },
    ];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    const chip = screen.getByRole("checkbox");
    expect(chip.getAttribute("aria-disabled")).toBe("true");
    expect(chip.getAttribute("title")).toBe(tooltip);
  });

  it("disabled chip has tabIndex=-1", () => {
    const entries: NodeFilterEntry[] = [
      { key: "decorator", label: "Decorator", count: 0, disabled: true },
    ];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByRole("checkbox").getAttribute("tabindex")).toBe("-1");
  });

  it("shows empty-state message when all non-disabled kinds are hidden", () => {
    const entries: NodeFilterEntry[] = [
      { key: "class", label: "Class", count: 5 },
      { key: "function", label: "Function", count: 3 },
      { key: "decorator", label: "Decorator", count: 0, disabled: true },
    ];

    render(
      <NodeFilterPanel
        entries={entries}
        hiddenKinds={new Set(["class", "function"])}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("No nodes match the current filters.")).toBeTruthy();
  });

  it("does NOT show empty-state when at least one non-disabled kind is visible", () => {
    const entries: NodeFilterEntry[] = [
      { key: "class", label: "Class", count: 5 },
      { key: "function", label: "Function", count: 3 },
    ];

    render(
      <NodeFilterPanel entries={entries} hiddenKinds={new Set(["class"])} onToggle={vi.fn()} />,
    );

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders Folder as label for file key (US3)", () => {
    const entries: NodeFilterEntry[] = [{ key: "file", label: "Folder", count: 4 }];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: "Hide Folder nodes" })).toBeTruthy();
  });

  it("hiddenNodeKinds initial value is effectively empty — default all-active (FR-010)", () => {
    // Render with empty hiddenKinds set (size 0) — all chips show aria-checked=true
    const entries: NodeFilterEntry[] = [
      { key: "class", label: "Class", count: 3 },
      { key: "function", label: "Function", count: 2 },
    ];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    const chips = screen.getAllByRole("checkbox");
    for (const chip of chips) {
      expect(chip.getAttribute("aria-checked")).toBe("true");
    }
  });

  it("zero-count chip still renders", () => {
    const entries: NodeFilterEntry[] = [{ key: "enum", label: "Enum", count: 0 }];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: "Hide Enum nodes" })).toBeTruthy();
    expect(screen.getByLabelText("0 nodes")).toBeTruthy();
  });
});
