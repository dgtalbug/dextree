import { describe, it, expect } from "vitest";
import {
  SHELL_COLUMNS,
  SHELL_ROWS,
  MERMAID_ROWS,
  MERMAID_BODY_COLUMNS,
  TAB_STRIP_HEIGHT,
  WORKSPACES_CARD_MIN_WIDTH,
  WORKSPACES_GRID_COLUMNS,
} from "./shellLayout.js";

describe("shellLayout constants", () => {
  it("pins the GraphView shell grid to the mockup proportions", () => {
    expect(SHELL_COLUMNS).toBe("260px 1fr 320px");
    expect(SHELL_ROWS).toBe("44px 1fr 28px");
  });

  it("pins the Mermaid shell rows and body split", () => {
    expect(MERMAID_ROWS).toBe("44px 44px 1fr 56px");
    expect(MERMAID_BODY_COLUMNS).toBe("2fr 1fr");
  });

  it("pins the tab strip height", () => {
    expect(TAB_STRIP_HEIGHT).toBe(32);
  });

  it("derives the responsive workspaces grid from the card min width", () => {
    expect(WORKSPACES_CARD_MIN_WIDTH).toBe("320px");
    expect(WORKSPACES_GRID_COLUMNS).toBe("repeat(auto-fill, minmax(320px, 1fr))");
  });
});
