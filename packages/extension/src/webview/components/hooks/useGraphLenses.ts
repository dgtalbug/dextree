import type { GraphNode } from "@dextree/core";
import {
  countArchitectureNodes,
  rankLensMatches,
  type LensId,
  type RankableLensId,
} from "@dextree/core/lenses";
import type { MultiDirectedGraph } from "graphology";
import { useCallback, useMemo, useState, type RefObject } from "react";

import { LENS_REGISTRY } from "../LensesPanel.js";
import type { LensResultRow } from "../LensResultTable.js";

/**
 * Fan-out / fan-in counts render as integers; fractional metrics (PageRank
 * importance) render to 3 decimals so distinct scores stay distinguishable.
 */
function formatLensMetric(metric: number): string {
  return Number.isInteger(metric) ? String(metric) : metric.toFixed(3);
}

export interface GraphLenses {
  activeLensId: LensId | null;
  lensCounts: Record<LensId, number>;
  /** Node ids matched by the active match-lens; null = no lens or a recolour lens. */
  lensMatchSet: ReadonlySet<string> | null;
  /** Colour fn of the active recolour lens; null otherwise. */
  lensColorOf: ((archLayer: string | undefined) => string | null) | null;
  onLensToggle: (id: LensId) => void;
  /** Ranked rows for the active rankable lens; null for architecture / no lens. */
  lensResultRows: LensResultRow[] | null;
}

/**
 * Lens state + all lens-derived values for GraphView. Extracted from the
 * GraphView component so the lens concern (counts, active-match set, recolour
 * fn, result table) lives in one place. Reads the live graphology graph via the
 * shared ref and recomputes when the lens or the node set changes.
 */
export function useGraphLenses(
  nodes: readonly GraphNode[],
  graphRef: RefObject<MultiDirectedGraph | null>,
): GraphLenses {
  const [activeLensId, setActiveLensId] = useState<LensId | null>(null);

  const lensCounts = useMemo<Record<LensId, number>>(() => {
    const graph = graphRef.current;
    const empty: Record<LensId, number> = {
      "god-function": 0,
      "god-class": 0,
      "most-used": 0,
      "least-used": 0,
      "dead-code": 0,
      "entry-points": 0,
      architecture: 0,
    };
    if (graph === null) return empty;
    const out = { ...empty };
    for (const id of Object.keys(LENS_REGISTRY) as LensId[]) {
      const mode = LENS_REGISTRY[id].mode;
      out[id] =
        mode.kind === "match" ? mode.selector(graph, nodes).size : countArchitectureNodes(nodes);
    }
    return out;
  }, [nodes]);

  // Node IDs the active lens matches. `null` means no lens active OR the active
  // lens is a recolour lens (which dims nothing).
  const lensMatchSet = useMemo<ReadonlySet<string> | null>(() => {
    if (activeLensId === null) return null;
    const graph = graphRef.current;
    if (graph === null) return null;
    const mode = LENS_REGISTRY[activeLensId].mode;
    if (mode.kind !== "match") return null;
    return mode.selector(graph, nodes);
  }, [activeLensId, nodes]);

  // The active recolour lens's colour fn, or null when no recolour lens is active.
  const lensColorOf = useMemo<((archLayer: string | undefined) => string | null) | null>(() => {
    if (activeLensId === null) return null;
    const mode = LENS_REGISTRY[activeLensId].mode;
    return mode.kind === "recolor" ? mode.colorOf : null;
  }, [activeLensId]);

  const onLensToggle = useCallback((id: LensId) => {
    setActiveLensId((current) => (current === id ? null : id));
  }, []);

  // Ranked result rows for the active rankable lens (architecture recolours and
  // has no table). Enriches the core `rankLensMatches` output with display
  // labels and a formatted metric.
  const lensResultRows = useMemo<LensResultRow[] | null>(() => {
    if (activeLensId === null || activeLensId === "architecture") return null;
    const graph = graphRef.current;
    if (graph === null) return null;
    const labelById = new Map(nodes.map((n) => [n.id, n.label]));
    return rankLensMatches(activeLensId as RankableLensId, graph, nodes).map((row) => ({
      nodeId: row.nodeId,
      label: labelById.get(row.nodeId) ?? row.nodeId,
      metric: row.metric === null ? null : formatLensMetric(row.metric),
    }));
  }, [activeLensId, nodes]);

  return { activeLensId, lensCounts, lensMatchSet, lensColorOf, onLensToggle, lensResultRows };
}
