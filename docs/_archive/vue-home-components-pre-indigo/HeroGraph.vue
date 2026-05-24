<!--
  HeroGraph — animated semantic-graph cluster for the hero.

  Matches the indigo HTML hero-graph:
    - Square aspect, 400×400 viewBox
    - 12 nodes in a radial cluster around `n0` (the core)
    - 17 base edges + 5 amber "pulse-edges" with marching-ants animation
    - Slow-spinning dashed ring behind the graph
    - Bottom-right stats badge ("12 nodes · 17 edges · ready" with live dot)
    - Nodes typed by kind: core (amber), module (cyan), leaf (muted ink)
    - Edges fade in with staggered delay; node radii spring in

  All animation honors prefers-reduced-motion.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

type Kind = "core" | "module" | "leaf";

interface Node {
  id: string;
  x: number;
  y: number;
  r: number;
  kind: Kind;
  label: string;
}

interface Edge {
  from: string;
  to: string;
}

// Layout matches indigo HTML hero graph (lines 4938-4978)
const nodes: Node[] = [
  { id: "n0",  x: 200, y: 200, r: 14, kind: "core",   label: "app.ts" },
  { id: "n1",  x: 110, y: 110, r: 9,  kind: "module", label: "auth" },
  { id: "n2",  x: 290, y: 100, r: 9,  kind: "module", label: "api" },
  { id: "n3",  x: 320, y: 220, r: 8,  kind: "leaf",   label: "db" },
  { id: "n4",  x: 280, y: 320, r: 8,  kind: "leaf",   label: "render" },
  { id: "n5",  x: 110, y: 310, r: 9,  kind: "module", label: "graph" },
  { id: "n6",  x: 60,  y: 220, r: 7,  kind: "leaf",   label: "utils" },
  { id: "n7",  x: 60,  y: 60,  r: 6,  kind: "leaf",   label: "jwt" },
  { id: "n8",  x: 360, y: 60,  r: 7,  kind: "leaf",   label: "schema" },
  { id: "n9",  x: 360, y: 320, r: 7,  kind: "leaf",   label: "export" },
  { id: "n10", x: 200, y: 350, r: 7,  kind: "leaf",   label: "store" },
  { id: "n11", x: 200, y: 50,  r: 7,  kind: "leaf",   label: "config" },
];

const edges: Edge[] = [
  { from: "n0", to: "n1" },
  { from: "n0", to: "n2" },
  { from: "n0", to: "n3" },
  { from: "n0", to: "n4" },
  { from: "n0", to: "n5" },
  { from: "n0", to: "n10" },
  { from: "n0", to: "n11" },
  { from: "n1", to: "n7" },
  { from: "n1", to: "n6" },
  { from: "n2", to: "n8" },
  { from: "n2", to: "n3" },
  { from: "n3", to: "n9" },
  { from: "n4", to: "n9" },
  { from: "n5", to: "n6" },
  { from: "n5", to: "n10" },
  { from: "n11", to: "n1" },
  { from: "n11", to: "n2" },
];

const pulseEdges: Edge[] = [
  { from: "n0", to: "n1" },
  { from: "n0", to: "n2" },
  { from: "n1", to: "n7" },
  { from: "n2", to: "n8" },
  { from: "n0", to: "n5" },
];

const nodeFill: Record<Kind, string> = {
  core: "var(--amber)",
  module: "var(--cyan)",
  leaf: "var(--ink-mute)",
};

function nodeFor(id: string): Node | undefined {
  return nodes.find((n) => n.id === id);
}

// Stats badge counters — animated from 0 → final on mount
const visibleNodes = ref(0);
const visibleEdges = ref(0);
const status = ref<"building" | "ready">("building");
const statusColor = computed(() =>
  status.value === "ready" ? "var(--ok)" : "var(--cyan)",
);

onMounted(() => {
  if (typeof window === "undefined") return;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (prefersReducedMotion) {
    visibleNodes.value = nodes.length;
    visibleEdges.value = edges.length;
    status.value = "ready";
    return;
  }

  const startDelay = 200;
  // Edges first (matches indigo build sequence: edges → pulse-edges → nodes)
  edges.forEach((_, i) => {
    setTimeout(
      () => {
        visibleEdges.value = i + 1;
      },
      startDelay + i * 30,
    );
  });

  const nodesStart = startDelay + edges.length * 30 + 400;
  nodes.forEach((_, i) => {
    setTimeout(
      () => {
        visibleNodes.value = i + 1;
      },
      nodesStart + i * 70,
    );
  });

  setTimeout(
    () => {
      status.value = "ready";
    },
    nodesStart + nodes.length * 70 + 200,
  );
});
</script>

<template>
  <div class="dx-hero-graph" id="hero-graph">
    <div class="dx-hero-graph__ring" aria-hidden="true" />

    <svg viewBox="0 0 400 400" aria-label="Animated semantic graph preview" role="img">
      <defs>
        <radialGradient id="dx-node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="var(--amber)" stop-opacity="0.6" />
          <stop offset="100%" stop-color="var(--amber)" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- Base edges (staggered fade-in) -->
      <g class="dx-hero-graph__edges">
        <line
          v-for="(edge, i) in edges"
          :key="`e-${i}`"
          :x1="nodeFor(edge.from)?.x"
          :y1="nodeFor(edge.from)?.y"
          :x2="nodeFor(edge.to)?.x"
          :y2="nodeFor(edge.to)?.y"
          class="dx-hero-graph__edge"
          :style="{ animationDelay: `${i * 55 + 200}ms` }"
        />
      </g>

      <!-- Pulse edges (amber marching-ants over the 5 most-active paths) -->
      <g class="dx-hero-graph__pulse-edges">
        <line
          v-for="(edge, i) in pulseEdges"
          :key="`p-${i}`"
          :x1="nodeFor(edge.from)?.x"
          :y1="nodeFor(edge.from)?.y"
          :x2="nodeFor(edge.to)?.x"
          :y2="nodeFor(edge.to)?.y"
          class="dx-hero-graph__pulse-edge"
        />
      </g>

      <!-- Nodes (springy radius reveal) -->
      <g class="dx-hero-graph__nodes">
        <g
          v-for="(node, i) in nodes"
          :key="node.id"
          :transform="`translate(${node.x}, ${node.y})`"
          class="dx-hero-graph__node-group"
          :style="{ animationDelay: `${1300 + i * 70}ms` }"
        >
          <circle
            v-if="node.kind === 'core'"
            r="22"
            fill="url(#dx-node-glow)"
            class="dx-hero-graph__glow"
          />
          <circle
            :r="node.r"
            :fill="nodeFill[node.kind]"
            class="dx-hero-graph__node"
            :class="`dx-hero-graph__node--${node.kind}`"
          />
          <text
            :y="-node.r - 6"
            text-anchor="middle"
            class="dx-hero-graph__label"
          >
            {{ node.label }}
          </text>
        </g>
      </g>
    </svg>

    <div class="dx-hero-graph__badge">
      <span class="dx-hero-graph__live-dot" aria-hidden="true" />
      <span><strong>{{ visibleNodes }}</strong> nodes</span>
      <span class="dx-hero-graph__sep">·</span>
      <span><strong>{{ visibleEdges }}</strong> edges</span>
      <span class="dx-hero-graph__sep">·</span>
      <span :style="{ color: statusColor }">{{ status }}</span>
    </div>
  </div>
</template>

<style scoped>
.dx-hero-graph {
  position: relative;
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
}

.dx-hero-graph__ring {
  position: absolute;
  inset: -8%;
  border-radius: 50%;
  border: 1px dashed var(--line-strong);
  opacity: 0.3;
  animation: dx-slow-spin 80s linear infinite;
}

@keyframes dx-slow-spin {
  to {
    transform: rotate(360deg);
  }
}

.dx-hero-graph svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.dx-hero-graph__edge {
  stroke: var(--line-strong);
  stroke-width: 1.1;
  fill: none;
  opacity: 0;
  animation: dx-edge-draw 1200ms var(--ease-out) forwards;
}

@keyframes dx-edge-draw {
  to {
    opacity: 0.55;
  }
}

.dx-hero-graph__pulse-edge {
  stroke: var(--amber);
  stroke-width: 2;
  fill: none;
  stroke-dasharray: 4 6;
  animation: dx-dash-flow 2s linear infinite;
  opacity: 0;
  animation:
    dx-pulse-edge-in 600ms var(--ease-out) 1100ms forwards,
    dx-dash-flow 2s linear 1700ms infinite;
}

@keyframes dx-pulse-edge-in {
  to {
    opacity: 1;
  }
}

@keyframes dx-dash-flow {
  to {
    stroke-dashoffset: -20;
  }
}

.dx-hero-graph__node-group {
  opacity: 0;
  animation: dx-node-pop 380ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes dx-node-pop {
  to {
    opacity: 1;
  }
}

.dx-hero-graph__node {
  transition:
    r 220ms var(--ease-spring),
    fill 320ms var(--ease);
  cursor: pointer;
}

.dx-hero-graph__node-group:hover .dx-hero-graph__node {
  filter: drop-shadow(0 0 14px var(--amber-glow));
}

.dx-hero-graph__node--core {
  filter: drop-shadow(0 0 12px var(--amber-glow));
}

.dx-hero-graph__glow {
  opacity: 0.7;
  transform-origin: center;
  animation: dx-glow-pulse 2.4s ease-in-out infinite;
}

@keyframes dx-glow-pulse {
  0%,
  100% {
    opacity: 0.5;
    transform: scale(0.9);
  }
  50% {
    opacity: 0.85;
    transform: scale(1.15);
  }
}

.dx-hero-graph__label {
  font-family: var(--mono);
  font-size: 9px;
  fill: var(--ink-mute);
  opacity: 0;
  pointer-events: none;
  animation: dx-label-fade-in 400ms ease-out 1800ms forwards;
}

@keyframes dx-label-fade-in {
  to {
    opacity: 1;
  }
}

.dx-hero-graph__badge {
  position: absolute;
  bottom: -8px;
  right: 0;
  font-family: var(--mono);
  font-size: 11px;
  background: var(--bg-elev);
  border: 1px solid var(--line);
  padding: 8px 12px;
  border-radius: var(--r-4);
  color: var(--ink-mute);
  display: flex;
  gap: 10px;
  align-items: center;
  box-shadow: var(--shadow-card);
  font-variant-numeric: tabular-nums;
}

.dx-hero-graph__live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 8px var(--ok);
  animation: dx-live-dot-pulse 1.6s infinite;
}

@keyframes dx-live-dot-pulse {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.4);
  }
}

.dx-hero-graph__badge strong {
  color: var(--ink);
  font-weight: 500;
}

.dx-hero-graph__sep {
  opacity: 0.4;
}

@media (prefers-reduced-motion: reduce) {
  .dx-hero-graph__ring,
  .dx-hero-graph__edge,
  .dx-hero-graph__pulse-edge,
  .dx-hero-graph__node-group,
  .dx-hero-graph__glow,
  .dx-hero-graph__label,
  .dx-hero-graph__live-dot {
    animation: none;
  }
  .dx-hero-graph__edge {
    opacity: 0.55;
  }
  .dx-hero-graph__pulse-edge {
    opacity: 1;
  }
  .dx-hero-graph__node-group,
  .dx-hero-graph__label {
    opacity: 1;
  }
}
</style>
