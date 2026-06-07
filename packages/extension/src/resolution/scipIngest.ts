import type { PreciseCallEdgeResult } from "../webview/protocol/messages.js";

/**
 * Optional, opt-in SCIP ingest — the power-user precise tier (phase 7).
 *
 * Lives in the extension host, NEVER in `core`, and is never required: when a
 * repo already ships a SCIP index (or the user runs scip-typescript / scip-java
 * / scip-python), those compiler-accurate edges can be ingested as `precise`-tier
 * edges. This is the accuracy ceiling, gated behind a build dependency, so it is
 * strictly an add-on behind a flag — the heuristic + LSP tiers stand on their own.
 *
 * This module is the seam: it defines the contract and the opt-in entry point.
 * Full SCIP protobuf decoding is intentionally deferred (it pulls in the scip
 * schema + a sizeable dependency) and wired only when a user opts in.
 */
export interface ScipIngestOptions {
  /** Absolute path to a `.scip` index file produced by a SCIP indexer. */
  indexPath: string;
}

export interface ScipIngestResult {
  status: "ingested" | "not-configured" | "unavailable";
  edges: PreciseCallEdgeResult[];
  /** Human-readable reason when status is not "ingested". */
  reason?: string;
}

/**
 * Ingest a SCIP index into precise-tier edges. Returns `not-configured` when no
 * path is given and `unavailable` when the SCIP decoder isn't installed — never
 * throws, so the graph keeps its heuristic/LSP edges regardless.
 */
export async function ingestScip(
  options: ScipIngestOptions | undefined,
): Promise<ScipIngestResult> {
  if (options === undefined || options.indexPath.trim() === "") {
    return { status: "not-configured", edges: [], reason: "No SCIP index path configured" };
  }

  // The SCIP protobuf decoder is an opt-in dependency not bundled by default.
  // When present, this branch decodes options.indexPath and maps SCIP
  // occurrences/relationships to PreciseCallEdgeResult[]. Until a user opts in,
  // we report it as unavailable rather than pretending to resolve.
  return {
    status: "unavailable",
    edges: [],
    reason: "SCIP ingest is opt-in; install the SCIP decoder to enable precise import from .scip",
  };
}
