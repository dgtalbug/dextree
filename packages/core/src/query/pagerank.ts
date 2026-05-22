import { DirectedGraph, type MultiDirectedGraph } from "graphology";
import pagerank from "graphology-pagerank";

// graphology-pagerank refuses MultiGraph inputs (parallel-edge ranking is
// ambiguous). Collapse parallel edges into a simple DirectedGraph so the
// caller can keep its MultiDirectedGraph for rendering distinct edge kinds.
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
