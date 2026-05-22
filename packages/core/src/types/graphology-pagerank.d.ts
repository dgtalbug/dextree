declare module "graphology-pagerank" {
  import type { AbstractGraph } from "graphology-types";

  interface PagerankOptions {
    alpha?: number;
    tolerance?: number;
    maxIterations?: number;
    getEdgeWeight?: string | null;
  }

  function pagerank(graph: AbstractGraph, options?: PagerankOptions): Record<string, number>;

  namespace pagerank {
    function assign(graph: AbstractGraph, options?: PagerankOptions): void;
  }

  export default pagerank;
}
