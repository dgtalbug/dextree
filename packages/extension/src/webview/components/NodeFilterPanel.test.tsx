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

  it("renders section header with All/None links", () => {
    const entries: NodeFilterEntry[] = [{ key: "class", label: "Class", count: 5 }];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByText("Node Types")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show all node types" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide all node types" })).toBeTruthy();
  });

  it("renders all filter rows from entries", () => {
    render(<NodeFilterPanel entries={makeEntries()} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByTestId("node-filter-panel")).toBeTruthy();
    // 10 entries, each an input checkbox
    expect(screen.getAllByRole("checkbox").length).toBe(10);
  });

  it("renders filter row with checkbox + codicon + label + count badge", () => {
    const entries: NodeFilterEntry[] = [{ key: "class", label: "Class", count: 14 }];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    const row = screen.getByTestId("filter-row-class");
    expect(row.querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(row.querySelector('[data-testid="filter-codicon"]')).toBeTruthy();
    expect(row.querySelector('[data-testid="filter-label"]')?.textContent).toBe("Class");
    expect(row.querySelector('[data-testid="filter-count"]')?.textContent).toBe("14");
  });

  it("active entry checkbox is checked", () => {
    const entries: NodeFilterEntry[] = [{ key: "class", label: "Class", count: 5 }];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("hidden entry checkbox is unchecked", () => {
    const entries: NodeFilterEntry[] = [{ key: "class", label: "Class", count: 5 }];

    render(
      <NodeFilterPanel entries={entries} hiddenKinds={new Set(["class"])} onToggle={vi.fn()} />,
    );

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("checking active entry calls onToggle", () => {
    const onToggle = vi.fn();
    const entries: NodeFilterEntry[] = [{ key: "class", label: "Class", count: 5 }];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("class");
  });

  it("disabled Decorator entry is unclickable", () => {
    const onToggle = vi.fn();
    const entries: NodeFilterEntry[] = [
      {
        key: "decorator",
        label: "Decorator",
        count: 0,
        disabled: true,
        tooltip: "Available when DecoratorExtractor ships",
      },
    ];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("disabled chip has aria-disabled on the row", () => {
    const tooltip = "Available when DecoratorExtractor ships";
    const entries: NodeFilterEntry[] = [
      { key: "decorator", label: "Decorator", count: 0, disabled: true, tooltip },
    ];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    const row = screen.getByTestId("filter-row-decorator");
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.getAttribute("title")).toBe(tooltip);
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

  it("renders Folder as label for file key", () => {
    const entries: NodeFilterEntry[] = [{ key: "file", label: "Folder", count: 4 }];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByText("Folder")).toBeTruthy();
  });

  it("zera-count entry still renders", () => {
    const entries: NodeFilterEntry[] = [{ key: "enum", label: "Enum", count: 0 }];

    render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByText("Enum")).toBeTruthy();
  });

  describe("All/None links", () => {
    it("clicking All shows hidden node types", () => {
      const onToggle = vi.fn();
      const entries = makeEntries();

      render(
        <NodeFilterPanel
          entries={entries}
          hiddenKinds={new Set(["class", "function"])}
          onToggle={onToggle}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Show all node types" }));
      expect(onToggle).toHaveBeenCalledTimes(2);
    });

    it("clicking None hides all visible node types", () => {
      const onToggle = vi.fn();
      const entries: NodeFilterEntry[] = [
        { key: "class", label: "Class", count: 5 },
        { key: "function", label: "Function", count: 3 },
      ];

      render(<NodeFilterPanel entries={entries} hiddenKinds={new Set()} onToggle={onToggle} />);

      fireEvent.click(screen.getByRole("button", { name: "Hide all node types" }));
      expect(onToggle).toHaveBeenCalledTimes(2);
    });
  });
});
