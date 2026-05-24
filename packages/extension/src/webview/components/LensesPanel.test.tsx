import { LENS_IDS, STUB_TOOLTIP_REQUIRED_SUBSTRING, type LensId } from "@dextree/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LENS_REGISTRY, LensesPanel } from "./LensesPanel.js";

function makeCounts(overrides: Partial<Record<LensId, number>> = {}): Record<LensId, number> {
  return {
    "god-class": 0,
    "most-used": 0,
    "least-used": 0,
    "entry-points": 0,
    architecture: 0,
    ...overrides,
  };
}

describe("LensesPanel", () => {
  afterEach(() => cleanup());

  it("renders the five lens rows in canonical order", () => {
    render(
      <LensesPanel activeLensId={null} lensCounts={makeCounts()} onLensToggle={() => undefined} />,
    );

    const rows = LENS_IDS.map((id) => screen.getByTestId(`lens-row-${id}`));
    expect(rows.length).toBe(5);

    const orderedTestIds = Array.from(document.querySelectorAll("[data-testid^=lens-row-]")).map(
      (el) => el.getAttribute("data-testid"),
    );
    expect(orderedTestIds).toEqual(LENS_IDS.map((id) => `lens-row-${id}`));
  });

  it("calls onLensToggle with the lens id when an active row is clicked", () => {
    const onToggle = vi.fn();
    render(<LensesPanel activeLensId={null} lensCounts={makeCounts()} onLensToggle={onToggle} />);

    fireEvent.click(screen.getByTestId("lens-row-god-class"));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("god-class");
  });

  it("marks the active row with aria-pressed=true and others with false", () => {
    render(
      <LensesPanel
        activeLensId="god-class"
        lensCounts={makeCounts()}
        onLensToggle={() => undefined}
      />,
    );

    expect(screen.getByTestId("lens-row-god-class").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("lens-row-most-used").getAttribute("aria-pressed")).toBe("false");
  });

  it("renders the count chip value for each lens", () => {
    render(
      <LensesPanel
        activeLensId={null}
        lensCounts={makeCounts({ "god-class": 7, "most-used": 25 })}
        onLensToggle={() => undefined}
      />,
    );

    expect(screen.getByTestId("lens-row-god-class").textContent).toContain("7");
    expect(screen.getByTestId("lens-row-most-used").textContent).toContain("25");
  });

  it("renders each row with its declared Codicon name in registry order", () => {
    render(
      <LensesPanel activeLensId={null} lensCounts={makeCounts()} onLensToggle={() => undefined} />,
    );

    for (const id of LENS_IDS) {
      const row = screen.getByTestId(`lens-row-${id}`);
      const iconKey = LENS_REGISTRY[id].iconKey;
      expect(row.querySelector(`.codicon-${iconKey}`)).not.toBeNull();
    }
  });

  it("marks Entry points and Architecture rows as aria-disabled with a tooltip naming slice 026", () => {
    render(
      <LensesPanel activeLensId={null} lensCounts={makeCounts()} onLensToggle={() => undefined} />,
    );

    for (const id of ["entry-points", "architecture"] as const) {
      const row = screen.getByTestId(`lens-row-${id}`);
      expect(row.getAttribute("aria-disabled")).toBe("true");
      expect(row.getAttribute("title")).toContain(STUB_TOOLTIP_REQUIRED_SUBSTRING);
    }
  });

  it("does not invoke onLensToggle when a disabled stub row is clicked", () => {
    const onToggle = vi.fn();
    render(<LensesPanel activeLensId={null} lensCounts={makeCounts()} onLensToggle={onToggle} />);

    fireEvent.click(screen.getByTestId("lens-row-entry-points"));
    fireEvent.click(screen.getByTestId("lens-row-architecture"));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("preserves an active lens when a disabled stub row is clicked", () => {
    const onToggle = vi.fn();
    render(
      <LensesPanel
        activeLensId="god-class"
        lensCounts={makeCounts({ "god-class": 5 })}
        onLensToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByTestId("lens-row-architecture"));

    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByTestId("lens-row-god-class").getAttribute("aria-pressed")).toBe("true");
  });
});
