import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LensResultTable, type LensResultRow } from "./LensResultTable.js";

afterEach(() => cleanup());

const ROWS: LensResultRow[] = [
  { nodeId: "a", label: "apiRouter", metric: "42" },
  { nodeId: "b", label: "bootstrap", metric: "31" },
];

describe("LensResultTable", () => {
  it("renders the lens title, count, and one row per match in order", () => {
    render(
      <LensResultTable
        lensTitle="God function"
        rows={ROWS}
        selectedNodeId={null}
        onSelectRow={() => undefined}
      />,
    );

    const table = screen.getByTestId("lens-result-table");
    expect(table.textContent).toContain("God function");
    const rows = screen.getAllByTestId(/lens-result-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "lens-result-row-a",
      "lens-result-row-b",
    ]);
    expect(rows[0]?.textContent).toContain("apiRouter");
    expect(rows[0]?.textContent).toContain("42");
  });

  it("fires onSelectRow with the node id when a row is clicked", () => {
    const onSelectRow = vi.fn();
    render(
      <LensResultTable
        lensTitle="God function"
        rows={ROWS}
        selectedNodeId={null}
        onSelectRow={onSelectRow}
      />,
    );

    fireEvent.click(screen.getByTestId("lens-result-row-b"));
    expect(onSelectRow).toHaveBeenCalledWith("b");
  });

  it("marks the selected row with aria-current", () => {
    render(
      <LensResultTable
        lensTitle="God function"
        rows={ROWS}
        selectedNodeId="a"
        onSelectRow={() => undefined}
      />,
    );
    expect(screen.getByTestId("lens-result-row-a").getAttribute("aria-current")).toBe("true");
    expect(screen.getByTestId("lens-result-row-b").getAttribute("aria-current")).toBeNull();
  });

  it("omits the metric span for categorical (null-metric) rows", () => {
    render(
      <LensResultTable
        lensTitle="Dead code"
        rows={[{ nodeId: "z", label: "unusedHelper", metric: null }]}
        selectedNodeId={null}
        onSelectRow={() => undefined}
      />,
    );
    const row = screen.getByTestId("lens-result-row-z");
    expect(row.textContent).toContain("unusedHelper");
  });

  it("shows an empty-state hint when there are no matches", () => {
    render(
      <LensResultTable
        lensTitle="Dead code"
        rows={[]}
        selectedNodeId={null}
        onSelectRow={() => undefined}
      />,
    );
    expect(screen.queryByTestId(/lens-result-row-/)).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/no matches/i);
  });
});
