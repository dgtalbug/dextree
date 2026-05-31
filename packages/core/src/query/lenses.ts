import { largestConnectedComponent } from "graphology-components";

import type { MultiDirectedGraph } from "graphology";
import type { ArchitecturalLayer, EntryKind } from "../types.js";

/**
 * Lens identities — string-literal union. Array order is also the visual
 * order of the lens rows in the webview's left rail. Mirrors the contract
 * at `specs/021-lenses-panel/contracts/lenses.ts`.
 */
export const LENS_IDS = [
  "god-function",
  "god-class",
  "most-used",
  "least-used",
  "dead-code",
  "entry-points",
  "architecture",
] as const;

export type LensId = (typeof LENS_IDS)[number];

/**
 * Minimal node shape consumed by selectors. The production graph uses the
 * full `GraphNode` from this package, but selectors only read `id`,
 * `importance`, `fanIn`, `entryKind`, and `archLayer` — keeping the input
 * type narrow lets tests construct lightweight fixtures.
 */
export interface LensInputNode {
  readonly id: string;
  readonly importance?: number;
  readonly fanIn?: number;
  readonly entryKind?: EntryKind;
  readonly archLayer?: ArchitecturalLayer;
}

/**
 * Pure function from `(graph, nodes)` to a match set. Same input →
 * byte-identical output. Returns a new `Set` each call.
 */
export type LensSelector = (
  graph: MultiDirectedGraph,
  nodes: readonly LensInputNode[],
) => ReadonlySet<string>;

/** Top-K cap for the God-class lens. */
export const GOD_CLASS_TOP_K = 10 as const;

/** Top-K cap for the Most-used lens. */
export const MOST_USED_TOP_K = 25 as const;

/** Top-K cap for the God-function lens. */
export const GOD_FUNCTION_TOP_K = 10 as const;

/** Fan-in threshold (inclusive) for the Least-used lens. */
export const LEAST_USED_FAN_IN_THRESHOLD = 1 as const;

export function selectGodClass(
  _graph: MultiDirectedGraph,
  nodes: readonly LensInputNode[],
): ReadonlySet<string> {
  const eligible = nodes.filter(
    (n): n is LensInputNode & { importance: number } => typeof n.importance === "number",
  );
  eligible.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return new Set(eligible.slice(0, GOD_CLASS_TOP_K).map((n) => n.id));
}

export function selectMostUsed(
  _graph: MultiDirectedGraph,
  nodes: readonly LensInputNode[],
): ReadonlySet<string> {
  const eligible = nodes.filter(
    (n): n is LensInputNode & { fanIn: number } => typeof n.fanIn === "number",
  );
  eligible.sort((a, b) => {
    if (b.fanIn !== a.fanIn) return b.fanIn - a.fanIn;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return new Set(eligible.slice(0, MOST_USED_TOP_K).map((n) => n.id));
}

/**
 * Outbound `CALLS` degree per node, read from the live graph.
 *
 * Fan-out is not persisted (only `fanIn` is — see `recomputeGraphHealth`), so
 * the god-function lens derives it at selection time. Edge kind is read from the
 * `edgeKind` attribute the webview sets on every edge; non-`CALLS` edges
 * (DEFINES / IMPORTS / …) do not count toward a function's fan-out. Nodes with
 * no outbound calls map to `0` so callers can rely on a total function.
 */
export function computeCallsFanOut(graph: MultiDirectedGraph): Map<string, number> {
  const fanOut = new Map<string, number>();
  graph.forEachNode((id) => fanOut.set(id, 0));
  graph.forEachDirectedEdge((_edge, attrs, source) => {
    if ((attrs as { edgeKind?: string }).edgeKind !== "CALLS") return;
    fanOut.set(source, (fanOut.get(source) ?? 0) + 1);
  });
  return fanOut;
}

/**
 * God-function lens: the orchestrators / connectors / API entries that call the
 * most other functions. Ranks nodes by outbound `CALLS` count (fan-out)
 * descending, breaking ties by id ascending for determinism, and returns the
 * top {@link GOD_FUNCTION_TOP_K}. Nodes with zero outbound calls are excluded —
 * a leaf is the opposite of a god-function.
 */
export function selectGodFunction(
  graph: MultiDirectedGraph,
  nodes: readonly LensInputNode[],
): ReadonlySet<string> {
  const fanOut = computeCallsFanOut(graph);
  const eligible = nodes
    .map((n) => ({ id: n.id, out: fanOut.get(n.id) ?? 0 }))
    .filter((n) => n.out > 0);
  eligible.sort((a, b) => {
    if (b.out !== a.out) return b.out - a.out;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return new Set(eligible.slice(0, GOD_FUNCTION_TOP_K).map((n) => n.id));
}

export function selectLeastUsed(
  graph: MultiDirectedGraph,
  nodes: readonly LensInputNode[],
): ReadonlySet<string> {
  const mainComponent = new Set(largestConnectedComponent(graph));
  const matches = new Set<string>();
  for (const node of nodes) {
    if (
      typeof node.fanIn === "number" &&
      node.fanIn <= LEAST_USED_FAN_IN_THRESHOLD &&
      mainComponent.has(node.id)
    ) {
      matches.add(node.id);
    }
  }
  return matches;
}

/**
 * One row of a lens result table: the matched node plus the lens's ranking
 * metric value (callee count, fan-in, PageRank, …). `metric` is `null` for
 * lenses whose membership is categorical rather than ranked (dead-code).
 */
export interface LensRankRow {
  readonly nodeId: string;
  readonly metric: number | null;
}

/** Lens ids that produce a ranked result table. Architecture recolours instead. */
export type RankableLensId = Exclude<LensId, "architecture">;

/**
 * Ordered result rows for a rankable lens — the data the result-table component
 * renders. Defined so the ranked rows and the {@link LensSelector} match set
 * cannot disagree: `new Set(rankLensMatches(id, …).map(r => r.nodeId))` always
 * equals the corresponding `select*` Set. Match-set lenses are ranked by their
 * metric (descending, id-tiebroken); `dead-code` is categorical so its rows are
 * ordered by id with a `null` metric.
 */
export function rankLensMatches(
  lensId: RankableLensId,
  graph: MultiDirectedGraph,
  nodes: readonly LensInputNode[],
): LensRankRow[] {
  switch (lensId) {
    case "god-class":
      return rankByNumber(nodes, (n) => n.importance, GOD_CLASS_TOP_K);
    case "most-used":
      return rankByNumber(nodes, (n) => n.fanIn, MOST_USED_TOP_K);
    case "god-function": {
      const fanOut = computeCallsFanOut(graph);
      return rankByNumber(
        nodes.filter((n) => (fanOut.get(n.id) ?? 0) > 0),
        (n) => fanOut.get(n.id) ?? 0,
        GOD_FUNCTION_TOP_K,
      );
    }
    case "least-used":
      return setToRows(selectLeastUsed(graph, nodes));
    case "dead-code":
      return setToRows(selectDeadCode(graph, nodes));
    case "entry-points":
      return setToRows(selectEntryPoints(graph, nodes));
    default: {
      // Exhaustiveness guard: adding a rankable lens id without a case here is
      // a compile error rather than a silent empty table at runtime.
      const _exhaustive: never = lensId;
      return _exhaustive;
    }
  }
}

/** Rank nodes by a numeric accessor desc, id-tiebroken, capped at top-K. */
function rankByNumber(
  nodes: readonly LensInputNode[],
  metricOf: (n: LensInputNode) => number | undefined,
  topK: number,
): LensRankRow[] {
  const eligible: Array<{ nodeId: string; metric: number }> = [];
  for (const n of nodes) {
    const metric = metricOf(n);
    if (typeof metric === "number") eligible.push({ nodeId: n.id, metric });
  }
  eligible.sort((a, b) => {
    if (b.metric !== a.metric) return b.metric - a.metric;
    return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
  });
  return eligible.slice(0, topK);
}

/** Wrap a categorical match set as id-ordered rows with no metric. */
function setToRows(ids: ReadonlySet<string>): LensRankRow[] {
  return [...ids]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((nodeId) => ({
      nodeId,
      metric: null,
    }));
}

/**
 * Entry-kind values that count as a real classification. `unclassified` is the
 * "could not decide" sentinel from `classifySymbol` and is deliberately
 * excluded — it is the absence of a signal, not an entry kind.
 */
export const ENTRY_POINT_KINDS: ReadonlySet<EntryKind> = new Set<EntryKind>([
  "runtime",
  "handler",
  "test",
  "public-api",
]);

export function selectEntryPoints(
  _graph: MultiDirectedGraph,
  nodes: readonly LensInputNode[],
): ReadonlySet<string> {
  const matches = new Set<string>();
  for (const node of nodes) {
    if (node.entryKind !== undefined && ENTRY_POINT_KINDS.has(node.entryKind)) {
      matches.add(node.id);
    }
  }
  return matches;
}

/**
 * Dead-code lens: symbols nothing in the indexed graph calls (`fanIn === 0`)
 * that are NOT entry-points. Entry-points (`runtime` / `handler` / `test` /
 * `public-api`) are reachable from outside the call graph — invoked by the
 * runtime, a route table, a test runner, or an external consumer — so a zero
 * fan-in there is expected, not dead. Nodes with an undefined `fanIn` are
 * excluded: absence of the signal is "unknown", not "provably dead".
 */
export function selectDeadCode(
  _graph: MultiDirectedGraph,
  nodes: readonly LensInputNode[],
): ReadonlySet<string> {
  const matches = new Set<string>();
  for (const node of nodes) {
    if (node.fanIn !== 0) continue;
    if (node.entryKind !== undefined && ENTRY_POINT_KINDS.has(node.entryKind)) continue;
    matches.add(node.id);
  }
  return matches;
}

/**
 * Architectural layers that carry a real classification, in outer-to-inner
 * order. `unknown` is excluded — it is the "no layer signal" sentinel, so the
 * architecture lens leaves those nodes at their base colour rather than
 * recolouring them. The architecture lens counts nodes whose `archLayer` is in
 * this set.
 */
export const CLASSIFIED_LAYERS: readonly ArchitecturalLayer[] = [
  "presentation",
  "application",
  "domain",
  "infrastructure",
  "test",
] as const;

const CLASSIFIED_LAYER_SET: ReadonlySet<ArchitecturalLayer> = new Set(CLASSIFIED_LAYERS);

/** Count of nodes the architecture lens recolours (those with a known layer). */
export function countArchitectureNodes(nodes: readonly LensInputNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.archLayer !== undefined && CLASSIFIED_LAYER_SET.has(node.archLayer)) {
      count += 1;
    }
  }
  return count;
}
