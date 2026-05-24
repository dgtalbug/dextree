<!--
  Section: "Fast first. Smart second."
  Skeleton: pass-1 vs pass-2 comparison block.
-->
<script setup lang="ts">
const passes = [
  {
    eyebrow: "Pass 1",
    title: "Tree-sitter",
    sub: "instant · deterministic",
    body: "Structural extraction across every supported language. Graph is usable in under a second. Doesn't need LSP. Doesn't block.",
  },
  {
    eyebrow: "Pass 2",
    title: "LSP enrichment",
    sub: "background · type-accurate",
    body: "Resolves calls through inheritance and generics. Adds type-accurate edges. Upgrades the graph in place — no re-render needed.",
  },
];
</script>

<template>
  <section id="how" class="dx-section">
    <div class="dx-home__shell">
      <div class="dx-section__heading">
        <p class="dx-section__eyebrow">how it works</p>
        <h2 class="dx-display">Fast first.<br /><em>Smart second.</em></h2>
        <p class="dx-section__lede">
          Two passes share one DuckDB graph. Pass 1 makes the graph useful;
          Pass 2 makes it accurate.
        </p>
      </div>

      <div class="dx-grid dx-grid--2">
        <article v-for="pass in passes" :key="pass.eyebrow" class="dx-card">
          <p class="dx-card__sub">{{ pass.eyebrow }}</p>
          <h3 class="dx-card__title">{{ pass.title }}</h3>
          <p class="dx-card__sub">{{ pass.sub }}</p>
          <p class="dx-card__body">{{ pass.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
