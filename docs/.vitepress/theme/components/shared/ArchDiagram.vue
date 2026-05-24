<!--
  ArchDiagram — markdown-authored architecture diagrams.

  Authors declare nodes + edges as props in any .md page:

    <ArchDiagram
      id="two-pass-flow"
      prev-id="overview-flow"
      next-id="data-fusion-flow"
      :height="420"
      :spread-default="true"
      :nodes="[
        { id: 'src',  label: 'Source',  sub: 'TS/JS/Py',   tone: 'neutral', col: 0, row: 0 },
        { id: 'p1',   label: 'Pass 1',  sub: 'Tree-sitter', tone: 'cyan',    col: 1, row: 0 },
        { id: 'graph',label: 'Graph',   sub: 'DuckDB',      tone: 'amber',   col: 2, row: 0 },
        { id: 'p2',   label: 'Pass 2',  sub: 'LSP',         tone: 'rose',    col: 1, row: 1 },
      ]"
      :edges="[
        { source: 'src',  target: 'p1',    step: 1, animated: true },
        { source: 'p1',   target: 'graph', step: 2, animated: true },
        { source: 'src',  target: 'p2',    step: 3, dashed: true },
        { source: 'p2',   target: 'graph', step: 4, dashed: true, animated: true },
      ]"
    />

  Features:
    - Toolbar: zoom in/out, fit-view, spread toggle, fullscreen, prev/next pager
    - Native browser fullscreen via requestFullscreen() with ESC to exit
    - prev-id / next-id link to other diagrams; pager buttons scroll to them
    - Spread layout: expands node positions outward from centroid
    - Hover tooltip per node (uses `tooltip` or falls back to `sub`)
    - Six color tones tied to the indigo palette
    - Animated edges with marching-ants flow direction
    - Step-numbered edges (small label on the edge)
    - Theme-aware: tracks dark/light via VitePress's isDark
-->
<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref } from "vue";
import { MarkerType, Position, VueFlow, useVueFlow, type Edge, type Node } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { useData } from "vitepress";
import ArchNode from "./ArchNode.vue";
import ArchGroupNode from "./ArchGroupNode.vue";
import { spreadPositions } from "../../utils/spread";

type Tone = "amber" | "cyan" | "rose" | "ok" | "warn" | "danger" | "neutral";
type Side = "top" | "right" | "bottom" | "left";

interface ArchNodeInput {
  id: string;
  label: string;
  sub?: string;
  tone?: Tone;
  /** Optional column index (0-based) for grid layout */
  col?: number;
  /** Optional row index (0-based) for grid layout */
  row?: number;
  /** Explicit hover tooltip; if absent, falls back to `sub` */
  tooltip?: string;
  /** Mark this node as a group container (renders the dashed box) */
  group?: boolean;
  /** Group container dimensions in px; ignored unless `group: true` */
  width?: number;
  height?: number;
}

interface ArchEdgeInput {
  source: string;
  target: string;
  /** Step number rendered on the edge (e.g. "1", "2", "3"). Optional. */
  step?: number;
  /** Override the auto-step label with a custom string */
  label?: string;
  /** Animated marching-ants edge (use for flow direction emphasis) */
  animated?: boolean;
  /** Render as a dashed line (use for optional/fallback paths) */
  dashed?: boolean;
  /** Side of the source node the edge leaves from */
  fromSide?: Side;
  /** Side of the target node the edge enters */
  toSide?: Side;
}

const props = withDefaults(
  defineProps<{
    /** Unique id of this diagram (used by prev/next pager to find by hash) */
    id?: string;
    /** id of the previous diagram (anywhere on this page or in the URL) */
    prevId?: string;
    /** id of the next diagram (anywhere on this page or in the URL) */
    nextId?: string;
    nodes: ArchNodeInput[];
    edges: ArchEdgeInput[];
    /** Visual height in px (in non-fullscreen mode) */
    height?: number;
    /** Default to spread layout on first render */
    spreadDefault?: boolean;
    /** Spread expansion factor (1.0 = no spread; 1.18 = arc-sdk default) */
    spreadFactor?: number;
  }>(),
  {
    id: undefined,
    prevId: undefined,
    nextId: undefined,
    height: 420,
    spreadDefault: true,
    spreadFactor: 1.18,
  },
);

// ── Vue Flow plumbing ──────────────────────────────────────
const nodeTypes = {
  archNode: markRaw(ArchNode),
  archGroup: markRaw(ArchGroupNode),
};

// Each instance needs a unique id so multiple <ArchDiagram> on one page
// don't share Vue Flow state.
const instanceId = `arch-${props.id ?? Math.random().toString(36).slice(2, 9)}`;
const { fitView, zoomIn, zoomOut } = useVueFlow(instanceId);

// ── grid layout: col/row → x/y ────────────────────────────
const COL_GAP = 220;
const ROW_GAP = 130;

const baseNodes = computed<Node[]>(() =>
  props.nodes.map((n, idx) => {
    const col = n.col ?? idx;
    const row = n.row ?? 0;
    const isGroup = n.group === true;

    return {
      id: n.id,
      type: isGroup ? "archGroup" : "archNode",
      position: { x: col * COL_GAP, y: row * ROW_GAP },
      data: {
        label: n.label,
        sub: n.sub,
        tone: n.tone ?? "neutral",
        tooltip: n.tooltip,
      },
      width: n.width ?? (isGroup ? 280 : 160),
      height: n.height ?? (isGroup ? 200 : 90),
      style: isGroup ? { width: `${n.width ?? 280}px`, height: `${n.height ?? 200}px` } : undefined,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
      connectable: false,
      selectable: false,
      zIndex: isGroup ? -1 : 1,
    };
  }),
);

// ── spread mode toggle ────────────────────────────────────
const isSpread = ref(props.spreadDefault);
function toggleSpread() {
  isSpread.value = !isSpread.value;
}

const layoutNodes = computed<Node[]>(() => {
  if (!isSpread.value) return baseNodes.value;
  const positioned = baseNodes.value.map((n) => ({
    id: n.id,
    position: n.position,
    width: (n.width as number) ?? 160,
    height: (n.height as number) ?? 90,
  }));
  const spread = spreadPositions(positioned, props.spreadFactor);
  // re-attach all original node fields with the new positions
  return baseNodes.value.map((n, i) => ({ ...n, position: spread[i].position }));
});

// ── edge mapping ──────────────────────────────────────────
const edges = computed<Edge[]>(() =>
  props.edges.map((e, idx) => {
    const labelText =
      e.label !== undefined ? e.label : e.step !== undefined ? String(e.step) : undefined;

    const classList: string[] = [];
    if (e.animated) classList.push("animated");
    if (e.dashed) classList.push("dashed");

    return {
      id: `${instanceId}-edge-${idx}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.fromSide ? `out-${e.fromSide}` : undefined,
      targetHandle: e.toSide ? `in-${e.toSide}` : undefined,
      type: "smoothstep",
      label: labelText,
      animated: e.animated === true,
      class: classList.join(" "),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
      },
      labelBgPadding: [4, 6] as [number, number],
      labelBgBorderRadius: 8,
    };
  }),
);

// ── fullscreen ───────────────────────────────────────────
const boardEl = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);

function syncFullscreenState() {
  if (typeof document === "undefined") return;
  isFullscreen.value = document.fullscreenElement === boardEl.value;
}

async function toggleFullscreen() {
  if (typeof document === "undefined" || !boardEl.value) return;
  if (document.fullscreenElement === boardEl.value) {
    await document.exitFullscreen();
    return;
  }
  await boardEl.value.requestFullscreen();
}

// ── prev/next pager ──────────────────────────────────────
// Author specifies prev-id / next-id; pager scrolls the matching
// element into view. Works whether the target is on the same page
// (anchor scroll) or referenced as `#some-id` in a URL.
function scrollToDiagram(targetId: string | undefined) {
  if (!targetId || typeof document === "undefined") return;
  const el = document.getElementById(`arch-${targetId}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    // fallback — if not on this page, try a hash navigation
    window.location.hash = `arch-${targetId}`;
  }
}

// ESC handler is automatic via the browser's fullscreen API.
// Keyboard pager: ← → when fullscreen.
function handleKeydown(event: KeyboardEvent) {
  if (!isFullscreen.value) return;
  if (event.key === "ArrowLeft" && props.prevId) {
    event.preventDefault();
    void document.exitFullscreen().then(() => scrollToDiagram(props.prevId));
  }
  if (event.key === "ArrowRight" && props.nextId) {
    event.preventDefault();
    void document.exitFullscreen().then(() => scrollToDiagram(props.nextId));
  }
}

// ── lifecycle ───────────────────────────────────────────
onMounted(() => {
  syncFullscreenState();
  document.addEventListener("fullscreenchange", syncFullscreenState);
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", syncFullscreenState);
  window.removeEventListener("keydown", handleKeydown);
});

// ── theme awareness (for Vue Flow's background color tinting) ──
const { isDark } = useData();
const bgColor = computed(() =>
  isDark.value ? "rgba(100, 116, 139, 0.16)" : "rgba(100, 116, 139, 0.22)",
);
</script>

<template>
  <div ref="boardEl" class="arch-diagram" :id="props.id ? `arch-${props.id}` : undefined">
    <div class="arch-diagram__toolbar" role="toolbar" aria-label="Diagram controls">
      <div class="arch-diagram__toolbar-group">
        <button
          class="arch-diagram__icon-btn"
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          @click="() => void zoomIn()"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        <button
          class="arch-diagram__icon-btn"
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          @click="() => void zoomOut()"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h10" />
          </svg>
        </button>
        <button
          class="arch-diagram__icon-btn"
          type="button"
          aria-label="Fit view"
          title="Fit view"
          @click="() => void fitView({ padding: 0.2 })"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />
          </svg>
        </button>
      </div>

      <div class="arch-diagram__toolbar-divider" aria-hidden="true" />

      <button
        class="arch-diagram__text-btn"
        type="button"
        :aria-pressed="isSpread"
        :title="isSpread ? 'Restore original node positions' : 'Spread nodes outward for more room'"
        @click="toggleSpread"
      >
        {{ isSpread ? "Original" : "Spread" }}
      </button>

      <div class="arch-diagram__toolbar-divider" aria-hidden="true" />

      <button
        class="arch-diagram__icon-btn"
        type="button"
        :aria-label="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
        :title="isFullscreen ? 'Exit fullscreen (ESC)' : 'Fullscreen'"
        :aria-pressed="isFullscreen"
        @click="toggleFullscreen"
      >
        <svg v-if="!isFullscreen" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3H3v3M10 3h3v3M13 10v3h-3M6 13H3v-3" />
        </svg>
        <svg v-else viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 6H3V3M10 6h3V3M13 10v3h-3M6 10H3v3" />
        </svg>
      </button>

      <template v-if="prevId || nextId">
        <div class="arch-diagram__toolbar-divider" aria-hidden="true" />
        <button
          class="arch-diagram__text-btn"
          type="button"
          title="Previous diagram"
          :disabled="!prevId"
          @click="scrollToDiagram(prevId)"
        >
          Prev
        </button>
        <button
          class="arch-diagram__text-btn"
          type="button"
          title="Next diagram"
          :disabled="!nextId"
          @click="scrollToDiagram(nextId)"
        >
          Next
        </button>
      </template>
    </div>

    <div class="arch-diagram__canvas" :style="{ height: `${height}px` }">
      <VueFlow
        :id="instanceId"
        :nodes="layoutNodes"
        :edges="edges"
        :node-types="nodeTypes"
        :fit-view-on-init="true"
        :fit-view-options="{ padding: 0.2 }"
        :min-zoom="0.2"
        :max-zoom="2"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :elements-selectable="false"
        :pan-on-drag="true"
        :zoom-on-scroll="false"
        :zoom-on-pinch="true"
      >
        <Background :gap="16" :size="1" :color="bgColor" />
      </VueFlow>
    </div>
  </div>
</template>
