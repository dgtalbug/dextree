import type { GraphEdge } from "@dextree/core";
import { MultiDirectedGraph } from "graphology";
import { describe, expect, it } from "vitest";

import { deriveVisibleView } from "./deriveVisibleView.js";
import { createGraphViewStore } from "./graphViewStore.js";

const DEFAULT_HIDDEN_NODE_KINDS = new Set(["file", "property", "variable", "enum", "type"]);
const DEFAULT_HIDDEN_EDGE_KINDS = new Set<GraphEdge["kind"]>(["DEFINES", "INHERITS"]);

function freshStore() {
  return createGraphViewStore({
    hiddenNodeKinds: DEFAULT_HIDDEN_NODE_KINDS,
    hiddenEdgeKinds: DEFAULT_HIDDEN_EDGE_KINDS,
  });
}

describe("createGraphViewStore", () => {
  it("seeds the injected initial primitives", () => {
    const state = freshStore().getState();

    expect(state.hiddenNodeKinds).toBe(DEFAULT_HIDDEN_NODE_KINDS);
    expect(state.hiddenEdgeKinds).toBe(DEFAULT_HIDDEN_EDGE_KINDS);
    expect(state.depth).toBe(3);
    expect(state.activeLensId).toBeNull();
    expect(state.selectedNodeId).toBeNull();
  });

  it("each setter updates exactly its slice", () => {
    const store = freshStore();

    store.getState().setDepth(5);
    expect(store.getState().depth).toBe(5);

    store.getState().setActiveLensId("god-function");
    expect(store.getState().activeLensId).toBe("god-function");

    store.getState().setSelectedNodeId("fn-a1");
    expect(store.getState().selectedNodeId).toBe("fn-a1");

    const nextNodeKinds = new Set(["method"]);
    store.getState().setHiddenNodeKinds(nextNodeKinds);
    expect(store.getState().hiddenNodeKinds).toBe(nextNodeKinds);

    const nextEdgeKinds = new Set<GraphEdge["kind"]>(["CALLS"]);
    store.getState().setHiddenEdgeKinds(nextEdgeKinds);
    expect(store.getState().hiddenEdgeKinds).toBe(nextEdgeKinds);

    // Setting one slice does not disturb the others.
    expect(store.getState().depth).toBe(5);
    expect(store.getState().activeLensId).toBe("god-function");
  });

  it("creates independent store instances (no cross-instance bleed)", () => {
    const a = freshStore();
    const b = freshStore();

    a.getState().setDepth(9);

    expect(a.getState().depth).toBe(9);
    expect(b.getState().depth).toBe(3);
  });

  it("notifies subscribers when a slice changes", () => {
    const store = freshStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.getState().setDepth(4);
    store.getState().setActiveLensId("dead-code");

    expect(notifications).toBe(2);
    unsubscribe();
  });

  it("parity: deriveVisibleView fed from store state matches the store's primitives", () => {
    const graph = new MultiDirectedGraph();
    graph.addNode("file-a", { nodeKind: "file" });
    graph.addNode("fn-a", { nodeKind: "symbol", symbolKind: "function" });
    graph.addNode("method-a", { nodeKind: "symbol", symbolKind: "method" });
    graph.addEdgeWithKey("call-1", "fn-a", "method-a", { edgeKind: "CALLS" });

    const store = freshStore();
    // Hide files via the store (the default already hides "file").
    const state = store.getState();

    const view = deriveVisibleView(graph, {
      hiddenNodeKinds: state.hiddenNodeKinds,
      hiddenEdgeKinds: state.hiddenEdgeKinds,
      depth: state.depth,
      activeLensId: state.activeLensId,
      selectedNodeId: state.selectedNodeId,
      depthVisibleNodeIds: null,
      focusNodeId: null,
    });

    // "file" is hidden by default → file-a drops; the two symbols + their CALLS edge remain.
    expect(view.nodeIds).toEqual(new Set(["fn-a", "method-a"]));
    expect(view.edgeIds).toEqual(new Set(["call-1"]));
    // The derived view echoes the store's primitive inputs.
    expect(view.hiddenNodeKinds).toBe(state.hiddenNodeKinds);
    expect(view.depth).toBe(state.depth);
    expect(view.activeLensId).toBe(state.activeLensId);
  });
});
