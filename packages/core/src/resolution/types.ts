import type { GraphEdgeKind } from "../types.js";

/** Confidence tier for a resolved relation. */
export type ResolutionTier = "precise" | "heuristic" | "unresolved";

/**
 * A resolved relation produced by a {@link CallResolver}. `targetId` is null when
 * the resolver could not confidently identify a target (it must NOT guess).
 */
export interface ResolvedEdge {
  readonly sourceId: string;
  readonly targetId: string | null;
  readonly kind: GraphEdgeKind;
  readonly tier: ResolutionTier;
  readonly confidence: number;
}

/**
 * Strategy contract for resolving call (and related) edges, so the engine depends
 * on the abstraction rather than a concrete resolver (RULE-ARCH-010). The
 * `heuristic` resolver (tags name-match) lives in `core`; a host injects the
 * `precise` resolver (e.g. VS Code's LSP), which overrides heuristic results for
 * the same call site. A resolver MUST record `unresolved` rather than link to an
 * unrelated same-named symbol.
 */
export interface CallResolver {
  readonly tier: Exclude<ResolutionTier, "unresolved">;
  /**
   * Resolve the callers (`in`) or callees (`out`) of a node. Returns the edges
   * the resolver is confident about; an empty array means "nothing to add".
   */
  resolve(nodeId: string, direction: "in" | "out"): Promise<readonly ResolvedEdge[]>;
}

/** A node's source position, for resolvers that query by location (e.g. an LSP). */
export interface NodeLocation {
  filePath: string;
  /** 0-based line. */
  line: number;
  /** 0-based column. */
  column: number;
}

/** A precise caller/callee resolved by a location-based source (e.g. a language server). */
export interface PreciseCallEdge {
  /** Display name of the related symbol (the caller or callee). */
  name: string;
  filePath: string;
  /** 0-based start line. */
  line: number;
  readonly tier: "precise";
  confidence: number;
}

/**
 * Host-side precise resolver contract (RULE-ARCH-010). Unlike {@link CallResolver}
 * (graph-node-id based, in `core`), this resolves from a source *position* because
 * the precise source — the user's language server — answers by file+position, not
 * by our graph ids. The host (VS Code / IntelliJ) implements it; `core` owns the
 * contract so the seam is real and portable. Degrades to an empty array when no
 * precise source answers, leaving the heuristic tier in place.
 */
export interface PreciseLocationResolver {
  readonly tier: "precise";
  resolve(node: NodeLocation, direction: "in" | "out"): Promise<readonly PreciseCallEdge[]>;
}

/**
 * A persisted `CALLS` edge still at the heuristic/unresolved tier, paired with the
 * location of its source symbol — the work-list item for the precise (pass-2)
 * resolution pass. The pass queries the language server at `sourceLocation` and,
 * on a match, upgrades this edge.
 */
export interface UnresolvedCallSite {
  edgeId: string;
  sourceLocation: NodeLocation;
}

/** A precise resolution to persist: an edge now points at a confirmed target symbol. */
export interface PreciseResolution {
  edgeId: string;
  targetId: string;
}
