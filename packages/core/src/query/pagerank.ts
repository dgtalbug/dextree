import { DirectedGraph, type MultiDirectedGraph } from "graphology";
import { centrality } from "graphology-metrics";

const pagerank = centrality.pagerank;

// `graphology-metrics` exposes a richer surface than the old `graphology-pagerank`
// dep (PageRank + centrality + HITS + modularity). PageRank itself is API-equivalent:
// same option keys (alpha / tolerance / maxIterations), same `Record<string, number>`
// return shape. We keep `toSimpleDirected` because parallel-edge ranking is ambiguous —
// converting to a simple graph gives deterministic scores regardless of how the caller
// builds the underlying MultiDirectedGraph.
function toSimpleDirected(graph: MultiDirectedGraph): DirectedGraph {
  const simple = new DirectedGraph();
  graph.forEachNode((node) => {
    simple.addNode(node);
  });
  graph.forEachEdge((_edge, _attrs, source, target) => {
    if (source === target) {
      return;
    }
    if (!simple.hasEdge(source, target)) {
      simple.addEdge(source, target);
    }
  });
  return simple;
}

export function computeNodeImportance(graph: MultiDirectedGraph): Map<string, number> {
  const scores = new Map<string, number>();
  const order = graph.order;

  if (order === 0) {
    return scores;
  }

  if (order === 1) {
    scores.set(graph.nodes()[0] as string, 1);
    return scores;
  }

  const simple = toSimpleDirected(graph);

  try {
    const raw = pagerank(simple, {
      // `getEdgeWeight: null` = unweighted, matching the legacy graphology-pagerank
      // default. Required field in graphology-metrics' typed options.
      getEdgeWeight: null,
      alpha: 0.85,
      tolerance: 1e-6,
      maxIterations: 100,
    }) as Record<string, number>;

    for (const [node, score] of Object.entries(raw)) {
      scores.set(node, score);
    }
  } catch {
    const uniform = 1 / order;
    graph.forEachNode((node) => {
      scores.set(node, uniform);
    });
  }

  return scores;
}
