<!--
  Section: "Four things headless tools can't do."
  Skeleton — 4-card grid. Real copy comes in enrichment.
-->
<script setup lang="ts">
const cards = [
  {
    title: "Ship safer PRs",
    sub: "Blast radius before merge",
    body: "Click your PR. See exactly what could break, with a risk score and core files in the impact zone.",
  },
  {
    title: "Delete code",
    sub: "Dead-code detection",
    body: "Surface unused public functions, orphaned exports, and abandoned tests in one DuckPGQ query.",
  },
  {
    title: "Onboard fast",
    sub: "Architecture in minutes",
    body: "New contributors get an interactive graph of every layer, every call edge, every diagnostic.",
  },
  {
    title: "Feed AI right",
    sub: "Real context, not summaries",
    body: "MCP server exposes the graph to Claude / Cursor / Copilot — they read structure, not just files.",
  },
];
</script>

<template>
  <section id="value" class="dx-section">
    <div class="dx-home__shell">
      <div class="dx-section__heading">
        <p class="dx-section__eyebrow">why it exists</p>
        <h2 class="dx-display">
          Four things <em>headless</em><br />tools can't do.
        </h2>
      </div>

      <div class="dx-grid dx-grid--4">
        <article v-for="card in cards" :key="card.title" class="dx-card">
          <h3 class="dx-card__title">{{ card.title }}</h3>
          <p class="dx-card__sub">{{ card.sub }}</p>
          <p class="dx-card__body">{{ card.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
