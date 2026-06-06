import type { MultiDirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";

// Fixed seed + resolution so community detection is deterministic run-to-run: the
// same graph always yields the same partition, and the map never reshuffles
// between opens (a reshuffling map reads as broken). Louvain is otherwise
// randomness- and order-sensitive; we remove both sources.
const LOUVAIN_SEED = 0x9e3779b9; // golden-ratio constant — arbitrary but fixed
const LOUVAIN_RESOLUTION = 1;

/**
 * A deterministic mulberry32 PRNG. Seeded with a fixed constant so Louvain's
 * internal tie-breaking is reproducible without depending on `Math.random`
 * (which is also unavailable in some host contexts).
 */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Community partition: a node id → community id map plus the community count. */
export interface CommunityPartition {
  /** node id → community id (0-based, stable for a fixed graph). */
  readonly byNode: ReadonlyMap<string, number>;
  /** Number of distinct communities. */
  readonly count: number;
}

/** An empty partition (no graph / no nodes). */
export const EMPTY_PARTITION: CommunityPartition = { byNode: new Map(), count: 0 };

/**
 * Assign each node a community id via deterministic Louvain. Singletons and
 * disconnected nodes each receive their own community (Louvain's natural
 * behavior). Returns an empty partition for an empty graph. Pure: the same graph
 * yields the same partition.
 */
export function detectCommunities(graph: MultiDirectedGraph): CommunityPartition {
  if (graph.order === 0) {
    return EMPTY_PARTITION;
  }

  const mapping = louvain(graph, {
    resolution: LOUVAIN_RESOLUTION,
    randomWalk: false,
    rng: seededRng(LOUVAIN_SEED),
  });

  const byNode = new Map<string, number>();
  const seen = new Set<number>();
  for (const nodeId of Object.keys(mapping)) {
    const community = mapping[nodeId] ?? 0;
    byNode.set(nodeId, community);
    seen.add(community);
  }

  return { byNode, count: seen.size };
}

// Radius of the ring on which community centroids are placed before layout.
// Communities seeded around this ring start apart; FA2 then tightens members
// inward while inter-community repulsion keeps the islands separated.
const COMMUNITY_RING_RADIUS = 100;
// Jitter radius for members around their community centroid (deterministic).
const MEMBER_JITTER_RADIUS = 8;

/**
 * Seed node coordinates by community so the force-directed layout starts with
 * members already grouped: each community gets a centroid evenly spaced on a
 * ring, and its members are placed near that centroid with deterministic jitter.
 * FA2 then refines (members attract, communities separate) from a non-degenerate,
 * reproducible start — the key to a stable, region-readable map. Pure aside from
 * mutating the graph's x/y; no randomness (jitter is index-derived).
 */
export function seedPositionsByCommunity(
  graph: MultiDirectedGraph,
  partition: CommunityPartition,
): void {
  if (graph.order === 0 || partition.count === 0) {
    return;
  }

  // Stable per-community centroid angle: sort community ids so the ring
  // assignment is reproducible regardless of node iteration order.
  const communityIds = [...new Set(partition.byNode.values())].sort((a, b) => a - b);
  const angleStep = (2 * Math.PI) / communityIds.length;
  const centroidByCommunity = new Map<number, { x: number; y: number }>();
  communityIds.forEach((community, index) => {
    const angle = index * angleStep;
    centroidByCommunity.set(community, {
      x: Math.cos(angle) * COMMUNITY_RING_RADIUS,
      y: Math.sin(angle) * COMMUNITY_RING_RADIUS,
    });
  });

  // Place each member near its centroid with a small deterministic spiral
  // offset (index-derived, so no two members coincide and no RNG is used).
  let memberIndex = 0;
  graph.forEachNode((nodeId) => {
    const community = partition.byNode.get(nodeId) ?? 0;
    const centroid = centroidByCommunity.get(community) ?? { x: 0, y: 0 };
    const offsetAngle = memberIndex * 2.399963; // golden angle → even spread
    const offsetRadius = (memberIndex % 7) + 1;
    graph.setNodeAttribute(
      nodeId,
      "x",
      centroid.x + Math.cos(offsetAngle) * (offsetRadius / 7) * MEMBER_JITTER_RADIUS,
    );
    graph.setNodeAttribute(
      nodeId,
      "y",
      centroid.y + Math.sin(offsetAngle) * (offsetRadius / 7) * MEMBER_JITTER_RADIUS,
    );
    memberIndex += 1;
  });
}
