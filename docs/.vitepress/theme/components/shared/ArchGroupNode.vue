<!--
  Optional cluster container — a dashed-bordered box authors can use to
  group related nodes visually. Pure decoration: no handles, no
  interactivity. Authors declare a group node with width/height and child
  nodes positioned within those bounds.
-->
<script setup lang="ts">
import { type NodeProps } from "@vue-flow/core";

interface ArchGroupData {
  label?: string;
}

defineProps<NodeProps<ArchGroupData>>();
</script>

<template>
  <div class="arch-group">
    <span v-if="data.label" class="arch-group__label">{{ data.label }}</span>
  </div>
</template>
