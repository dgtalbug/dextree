import type { GraphEdge } from "@dextree/core";
import type { LensId } from "@dextree/core/lenses";
import { create } from "zustand";

/**
 * The view-membership primitives the GraphView owns — the inputs that determine
 * which nodes/edges are members of the visible view. These were previously held
 * as React `useState` mirrored into refs so the imperative Sigma reducer could
 * read them; this store is the single home for that state. Transient-emphasis
 * state (hover, selection highlight, trace path) is intentionally *not* here —
 * it is momentary appearance, not view membership.
 *
 * The imperative Sigma reducer reads these via `store.getState()` (it cannot
 * subscribe to React re-renders); React components read them via the `useStore`
 * hook with a selector.
 */
export interface GraphViewState {
  /** Node-kind keys hidden by the node-type filter ("file" | SymbolKind | "decorator"). */
  hiddenNodeKinds: ReadonlySet<string>;
  /** Edge-kind values hidden by the edge-type filter. */
  hiddenEdgeKinds: ReadonlySet<GraphEdge["kind"]>;
  /** Depth window radius around the anchor(s). Default 3. */
  depth: number;
  /** Active lens (first-class subject selector), or null when none. */
  activeLensId: LensId | null;
  /** Currently selected node id, or null when nothing is selected. */
  selectedNodeId: string | null;

  setHiddenNodeKinds: (kinds: ReadonlySet<string>) => void;
  setHiddenEdgeKinds: (kinds: ReadonlySet<GraphEdge["kind"]>) => void;
  setDepth: (depth: number) => void;
  setActiveLensId: (lensId: LensId | null) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
}

/**
 * Initial state for a fresh GraphView. The hidden-kind defaults are injected by
 * the caller rather than imported here so the store stays free of the
 * component's presentation constants and remains trivially testable.
 */
export interface GraphViewStoreInit {
  hiddenNodeKinds: ReadonlySet<string>;
  hiddenEdgeKinds: ReadonlySet<GraphEdge["kind"]>;
  depth?: number;
  activeLensId?: LensId | null;
  selectedNodeId?: string | null;
}

const DEFAULT_DEPTH = 3;

/**
 * Create an isolated GraphView store instance. A factory (rather than a module
 * singleton) keeps each mounted GraphView independent and lets tests construct a
 * fresh store per case with no cross-test bleed.
 */
export function createGraphViewStore(init: GraphViewStoreInit) {
  return create<GraphViewState>((set) => ({
    hiddenNodeKinds: init.hiddenNodeKinds,
    hiddenEdgeKinds: init.hiddenEdgeKinds,
    depth: init.depth ?? DEFAULT_DEPTH,
    activeLensId: init.activeLensId ?? null,
    selectedNodeId: init.selectedNodeId ?? null,

    setHiddenNodeKinds: (kinds) => set({ hiddenNodeKinds: kinds }),
    setHiddenEdgeKinds: (kinds) => set({ hiddenEdgeKinds: kinds }),
    setDepth: (depth) => set({ depth }),
    setActiveLensId: (activeLensId) => set({ activeLensId }),
    setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  }));
}

/** The store instance type returned by {@link createGraphViewStore}. */
export type GraphViewStore = ReturnType<typeof createGraphViewStore>;
