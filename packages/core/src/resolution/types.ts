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
