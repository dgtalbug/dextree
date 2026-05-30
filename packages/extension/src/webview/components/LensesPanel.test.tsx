import { LENS_IDS, type LensId } from "@dextree/core/lenses";
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

  it("renders Entry points and Architecture rows as enabled with no slice-026 tooltip", () => {
    render(
      <LensesPanel activeLensId={null} lensCounts={makeCounts()} onLensToggle={() => undefined} />,
    );

    for (const id of ["entry-points", "architecture"] as const) {
      const row = screen.getByTestId(`lens-row-${id}`);
      expect(row.getAttribute("aria-disabled")).toBeNull();
      const title = row.getAttribute("title");
      expect(title === null || !title.includes("slice 026")).toBe(true);
    }
  });

  it("invokes onLensToggle when the entry-points or architecture row is clicked", () => {
    const onToggle = vi.fn();
    render(<LensesPanel activeLensId={null} lensCounts={makeCounts()} onLensToggle={onToggle} />);

    fireEvent.click(screen.getByTestId("lens-row-entry-points"));
    fireEvent.click(screen.getByTestId("lens-row-architecture"));

    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenNthCalledWith(1, "entry-points");
    expect(onToggle).toHaveBeenNthCalledWith(2, "architecture");
  });

  // Slice 033 US2 — mockup lens row structure
  describe("mockup structure (slice 033 US2)", () => {
    it("renders each lens row with icon, title, description, and count badge", () => {
      render(
        <LensesPanel
          activeLensId={null}
          lensCounts={makeCounts({ "god-class": 7 })}
          onLensToggle={() => undefined}
        />,
      );

      const row = screen.getByTestId("lens-row-god-class");
      // Icon is present (Codicon span inside .lensIcon)
      expect(row.querySelector(".codicon-star")).not.toBeNull();
      // Title text is rendered
      expect(row.textContent).toContain("God class / function");
      // Description is rendered
      expect(row.textContent).toContain("Top-10 by PageRank");
      // Count badge shows value
      expect(row.textContent).toContain("7");
    });

    it("activates lens row with aria-pressed=true", () => {
      render(
        <LensesPanel
          activeLensId="god-class"
          lensCounts={makeCounts({ "god-class": 7 })}
          onLensToggle={() => undefined}
        />,
      );

      const row = screen.getByTestId("lens-row-god-class");
      expect(row.getAttribute("aria-pressed")).toBe("true");
    });

    it("renders section header", () => {
      render(
        <LensesPanel
          activeLensId={null}
          lensCounts={makeCounts()}
          onLensToggle={() => undefined}
        />,
      );

      expect(screen.getByText("LENSES")).toBeTruthy();
    });
  });
});
