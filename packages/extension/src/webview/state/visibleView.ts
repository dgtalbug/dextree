import type { GraphEdge } from "@dextree/core";
import type { LensId } from "@dextree/core/lenses";

/**
 * The single, authoritative description of what the user is currently looking at
 * in the GraphView. Every render decision derives from this object so that the
 * notion of "the visible subgraph" lives in exactly one place instead of being
 * re-derived independently by the reducers, export, and trace.
 *
 * `nodeIds` / `edgeIds` are the membership of the view after every filter has
 * been applied. The remaining fields are the inputs that produced that
 * membership, retained so consumers (e.g. the inspector, future export) can see
 * *why* the view looks the way it does without re-running the derivation.
 *
 * The sets are `ReadonlySet` because a `VisibleView` is a derived snapshot — it
 * is replaced wholesale when an input changes, never mutated in place.
 */
export interface VisibleView {
  /** Node ids that are members of the view (not hidden by any filter). */
  readonly nodeIds: ReadonlySet<string>;
  /** Edge ids that are members of the view (not hidden by any filter). */
  readonly edgeIds: ReadonlySet<string>;
  /** The active lens (the first-class subject selector), or null when none. */
  readonly activeLensId: LensId | null;
  /** Node-kind keys currently hidden ("file" | SymbolKind | "decorator"). */
  readonly hiddenNodeKinds: ReadonlySet<string>;
  /** Edge-kind values currently hidden. */
  readonly hiddenEdgeKinds: ReadonlySet<GraphEdge["kind"]>;
  /** Depth window around the anchor(s); only meaningful when depth is enabled. */
  readonly depth: number;
  /** The focused node id, or null when no focus is active. */
  readonly focusNodeId: string | null;
}

/**
 * A plain-JSON form of {@link VisibleView} for crossing the webview↔host
 * boundary, where `Set` does not survive `postMessage` structured-clone in a
 * useful shape. Arrays preserve ordering and are trivially re-hydrated into
 * `Set`s on the receiving side via {@link visibleViewFromSerializable}.
 */
export interface SerializableVisibleView {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly activeLensId: LensId | null;
  readonly hiddenNodeKinds: readonly string[];
  readonly hiddenEdgeKinds: readonly GraphEdge["kind"][];
  readonly depth: number;
  readonly focusNodeId: string | null;
}

/** Convert a {@link VisibleView} into its serializable, `postMessage`-safe form. */
export function toSerializableVisibleView(view: VisibleView): SerializableVisibleView {
  return {
    nodeIds: [...view.nodeIds],
    edgeIds: [...view.edgeIds],
    activeLensId: view.activeLensId,
    hiddenNodeKinds: [...view.hiddenNodeKinds],
    hiddenEdgeKinds: [...view.hiddenEdgeKinds],
    depth: view.depth,
    focusNodeId: view.focusNodeId,
  };
}

/** Re-hydrate a {@link SerializableVisibleView} back into a {@link VisibleView}. */
export function visibleViewFromSerializable(view: SerializableVisibleView): VisibleView {
  return {
    nodeIds: new Set(view.nodeIds),
    edgeIds: new Set(view.edgeIds),
    activeLensId: view.activeLensId,
    hiddenNodeKinds: new Set(view.hiddenNodeKinds),
    hiddenEdgeKinds: new Set(view.hiddenEdgeKinds),
    depth: view.depth,
    focusNodeId: view.focusNodeId,
  };
}
