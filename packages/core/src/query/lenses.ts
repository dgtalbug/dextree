import { largestConnectedComponent } from "graphology-components";

import type { MultiDirectedGraph } from "graphology";
import type { ArchitecturalLayer, EntryKind } from "../types.js";

/**
 * Lens identities — string-literal union. Array order is also the visual
 * order of the lens rows in the webview's left rail. Mirrors the contract
 * at `specs/021-lenses-panel/contracts/lenses.ts`.
 */
export const LENS_IDS = [
  "god-class",
  "most-used",
  "least-used",
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
