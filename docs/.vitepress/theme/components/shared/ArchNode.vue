<!--
  Custom Vue Flow node for ArchDiagram. Renders a tone-colored block with
  `label` + optional `sub` line, plus an invisible `Handle` on each side
  so edges can attach naturally. Hover shows the `sub` text as a tooltip
  if `tooltip` data is provided (defaults to the sub line itself).
-->
<script setup lang="ts">
import { computed } from "vue";
import { Handle, Position, type NodeProps } from "@vue-flow/core";

type Tone = "amber" | "cyan" | "rose" | "ok" | "warn" | "danger" | "neutral";

interface ArchNodeData {
  label: string;
  sub?: string;
  tone?: Tone;
  tooltip?: string;
}

const props = defineProps<NodeProps<ArchNodeData>>();

const sides = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const;

const toneClass = computed(
  () => `arch-node--${props.data.tone ?? "neutral"}`,
);

const tooltipText = computed(
  () => props.data.tooltip ?? props.data.sub ?? "",
);
</script>

<template>
  <div
    class="arch-node"
    :class="toneClass"
    :data-tooltip="tooltipText || null"
  >
    <!-- Source + target handles on every side; Vue Flow picks the right one
         based on the edge's sourceHandle/targetHandle. We make them
         invisible because most architecture diagrams don't need visible
         dots; they re-appear on node hover for affordance. -->
    <template v-for="side in sides" :key="side.id">
      <Handle
        type="source"
        :id="`out-${side.id}`"
        :position="side.position"
        class="arch-handle"
        :connectable="false"
      />
      <Handle
        type="target"
        :id="`in-${side.id}`"
        :position="side.position"
        class="arch-handle"
        :connectable="false"
      />
    </template>

    <div class="arch-node__label">{{ data.label }}</div>
    <div v-if="data.sub" class="arch-node__sub">{{ data.sub }}</div>
  </div>
</template>
