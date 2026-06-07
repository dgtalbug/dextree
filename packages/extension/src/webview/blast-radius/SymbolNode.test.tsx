import { ReactFlowProvider } from "@xyflow/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { FocusedNode } from "./focusedGraphModel.js";
import { SymbolNode } from "./SymbolNode.js";

afterEach(cleanup);

function node(over: Partial<FocusedNode> = {}): FocusedNode {
  return {
    id: "n1",
    label: "getUser",
    nodeType: "symbol",
    symbolKind: "function",
    importance: 1,
    isCore: false,
    ring: 1,
    isFocus: false,
    ...over,
  };
}

/** SymbolNode uses React Flow's <Handle>, which needs the provider context. */
function renderNode(data: FocusedNode) {
  // NodeProps has many required fields; the card only reads `data`.
  const props = { data } as unknown as Parameters<typeof SymbolNode>[0];
  return render(
    <ReactFlowProvider>
      <SymbolNode {...props} />
    </ReactFlowProvider>,
  );
}

describe("SymbolNode", () => {
  it("renders the symbol name and kind badge inside a card", () => {
    renderNode(node({ label: "getUser", symbolKind: "function" }));
    const card = screen.getByTestId("focused-symbol-node");
    expect(card.textContent).toContain("getUser");
    expect(card.textContent).toContain("function");
  });

  it("shows the file badge/icon for a file node", () => {
    renderNode(node({ nodeType: "file", symbolKind: undefined, label: "user.ts" }));
    const card = screen.getByTestId("focused-symbol-node");
    expect(card.textContent).toContain("user.ts");
    expect(card.textContent).toContain("file");
    expect(card.querySelector(".codicon-symbol-file")).not.toBeNull();
  });

  it("renders a class node with the class icon", () => {
    renderNode(node({ symbolKind: "class", label: "UserService" }));
    const card = screen.getByTestId("focused-symbol-node");
    expect(card.querySelector(".codicon-symbol-class")).not.toBeNull();
    expect(card.textContent).toContain("class");
  });
});
