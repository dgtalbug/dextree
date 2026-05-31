import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EdgeTypesPanel, type EdgeTypeEntry } from "./EdgeTypesPanel.js";

const sampleEntries: EdgeTypeEntry[] = [
  {
    kind: "CONTAINS",
    label: "Contains",
    count: 169,
    disabled: true,
    tooltip: "Folder containment is always shown",
  },
  { kind: "DEFINES", label: "Defines", count: 1024 },
  { kind: "IMPORTS", label: "Imports", count: 386 },
  { kind: "CALLS", label: "Calls", count: 2100 },
  { kind: "INHERITS", label: "Extends", count: 42 },
  {
    kind: "IMPLEMENTS",
    label: "Implements",
    count: 31,
    disabled: true,
    tooltip: "Implements edges are always shown",
  },
];

function renderPanel(overrides?: {
  hiddenKinds?: Set<string>;
  onToggle?: ReturnType<typeof vi.fn>;
}) {
  const onToggle = overrides?.onToggle ?? vi.fn();
  const hiddenKinds = overrides?.hiddenKinds ?? new Set<string>();
  const result = render(
    <EdgeTypesPanel entries={sampleEntries} hiddenKinds={hiddenKinds} onToggle={onToggle} />,
  );
  return { ...result, onToggle };
}

describe("EdgeTypesPanel", () => {
  afterEach(() => cleanup());

  it("renders the section header with All / None link buttons", () => {
    renderPanel();

    expect(screen.getByText("Edge Types")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show all edge types" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide all edge types" })).toBeTruthy();
  });

  it("renders one row per entry with checkbox, colored dot, label, and count", () => {
    const { container } = renderPanel();

    for (const entry of sampleEntries) {
      const row = screen.getByTestId(`edge-row-${entry.kind}`);
      expect(within(row).getByText(entry.label)).toBeTruthy();
      expect(within(row).getByText(String(entry.count))).toBeTruthy();
      expect(row.querySelector('input[type="checkbox"]')).toBeTruthy();
    }
    // Each row carries a colored dot element.
    expect(container.querySelectorAll('[data-testid="edge-dot"]').length).toBe(
      sampleEntries.length,
    );
  });

  it("colors each dot from the edge kind (token resolves to a real value, not undefined)", () => {
    renderPanel();

    // The dot's color must come from a defined --edge-color-<kind> custom
    // property. A bare `var(--edge-color-defines)` with no fallback renders
    // colorless when the token is undefined — assert a fallback is present.
    const dot = within(screen.getByTestId("edge-row-DEFINES")).getByTestId("edge-dot");
    const bg = (dot as HTMLElement).style.background || (dot as HTMLElement).style.backgroundColor;
    expect(bg).toMatch(/var\(--edge-color-defines,/);
  });

  it("checks visible kinds and unchecks hidden kinds", () => {
    renderPanel({ hiddenKinds: new Set(["IMPORTS"]) });

    const importsRow = screen.getByTestId("edge-row-IMPORTS");
    const definesRow = screen.getByTestId("edge-row-DEFINES");
    expect((importsRow.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
      false,
    );
    expect((definesRow.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("renders disabled rows for CONTAINS and IMPLEMENTS with a tooltip", () => {
    renderPanel();

    const containsRow = screen.getByTestId("edge-row-CONTAINS");
    const implementsRow = screen.getByTestId("edge-row-IMPLEMENTS");
    expect(containsRow.getAttribute("aria-disabled")).toBe("true");
    expect(implementsRow.getAttribute("aria-disabled")).toBe("true");
    expect(containsRow.getAttribute("title")).toBe("Folder containment is always shown");
    expect((containsRow.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(
      true,
    );
  });

  it("does not call onToggle when a disabled row is clicked", () => {
    const { onToggle } = renderPanel();

    fireEvent.click(
      screen.getByTestId("edge-row-CONTAINS").querySelector('input[type="checkbox"]')!,
    );

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("calls onToggle with the kind when an enabled row checkbox is clicked", () => {
    const { onToggle } = renderPanel();

    fireEvent.click(screen.getByTestId("edge-row-CALLS").querySelector('input[type="checkbox"]')!);

    expect(onToggle).toHaveBeenCalledWith("CALLS");
  });

  it("All button shows every currently-hidden enabled kind", () => {
    const onToggle = vi.fn();
    renderPanel({ hiddenKinds: new Set(["DEFINES", "IMPORTS"]), onToggle });

    fireEvent.click(screen.getByRole("button", { name: "Show all edge types" }));

    // Only the two hidden enabled kinds get toggled back on.
    expect(onToggle).toHaveBeenCalledWith("DEFINES");
    expect(onToggle).toHaveBeenCalledWith("IMPORTS");
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("None button hides every currently-visible enabled kind (skips disabled)", () => {
    const onToggle = vi.fn();
    renderPanel({ onToggle });

    fireEvent.click(screen.getByRole("button", { name: "Hide all edge types" }));

    // 4 enabled kinds (DEFINES, IMPORTS, CALLS, INHERITS); CONTAINS + IMPLEMENTS are disabled.
    expect(onToggle).toHaveBeenCalledTimes(4);
    expect(onToggle).not.toHaveBeenCalledWith("CONTAINS");
    expect(onToggle).not.toHaveBeenCalledWith("IMPLEMENTS");
  });

  it("shows an empty-state status when all enabled kinds are hidden", () => {
    renderPanel({ hiddenKinds: new Set(["DEFINES", "IMPORTS", "CALLS", "INHERITS"]) });

    expect(screen.getByRole("status")).toBeTruthy();
  });
});
