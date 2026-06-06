import type { GraphEdge } from "@dextree/core";
import { describe, expect, it } from "vitest";

import {
  toSerializableVisibleView,
  visibleViewFromSerializable,
  type VisibleView,
} from "./visibleView.js";

function sampleView(): VisibleView {
  return {
    nodeIds: new Set(["a", "b"]),
    edgeIds: new Set(["e1"]),
    activeLensId: "god-function",
    hiddenNodeKinds: new Set(["file"]),
    hiddenEdgeKinds: new Set<GraphEdge["kind"]>(["DEFINES"]),
    depth: 4,
    focusNodeId: "a",
  };
}

describe("VisibleView serialization", () => {
  it("converts a view to its array-based serializable form", () => {
    const serializable = toSerializableVisibleView(sampleView());

    expect(serializable.nodeIds).toEqual(["a", "b"]);
    expect(serializable.edgeIds).toEqual(["e1"]);
    expect(serializable.activeLensId).toBe("god-function");
    expect(serializable.hiddenNodeKinds).toEqual(["file"]);
    expect(serializable.hiddenEdgeKinds).toEqual(["DEFINES"]);
    expect(serializable.depth).toBe(4);
    expect(serializable.focusNodeId).toBe("a");
  });

  it("round-trips through serialize → deserialize preserving membership", () => {
    const original = sampleView();

    const restored = visibleViewFromSerializable(toSerializableVisibleView(original));

    expect(restored.nodeIds).toEqual(original.nodeIds);
    expect(restored.edgeIds).toEqual(original.edgeIds);
    expect(restored.hiddenNodeKinds).toEqual(original.hiddenNodeKinds);
    expect(restored.hiddenEdgeKinds).toEqual(original.hiddenEdgeKinds);
    expect(restored.activeLensId).toBe(original.activeLensId);
    expect(restored.depth).toBe(original.depth);
    expect(restored.focusNodeId).toBe(original.focusNodeId);
  });

  it("preserves null lens and focus across the round-trip", () => {
    const view: VisibleView = { ...sampleView(), activeLensId: null, focusNodeId: null };

    const restored = visibleViewFromSerializable(toSerializableVisibleView(view));

    expect(restored.activeLensId).toBeNull();
    expect(restored.focusNodeId).toBeNull();
  });
});
