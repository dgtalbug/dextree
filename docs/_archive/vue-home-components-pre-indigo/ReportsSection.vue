<!--
  Section: "Reports that read the graph for you."
  Skeleton: list of Alfred report templates with brief descriptions.
-->
<script setup lang="ts">
const reports = [
  {
    name: "Architecture overview",
    sub: "alfred run arch-overview",
    body: "A narrative summary of the system: layers, key modules, hottest call paths, and where the moats are.",
  },
  {
    name: "Onboarding doc",
    sub: "alfred run onboard",
    body: "A README-shaped doc tuned to a new contributor's reading path. Generated from the actual graph, not folder names.",
  },
  {
    name: "PR summary",
    sub: "alfred run pr-summary",
    body: "Per-PR risk report. Blast radius narrative, files in the impact zone, suggested reviewers based on git ownership.",
  },
  {
    name: "Dead code report",
    sub: "alfred run dead-code",
    body: "Public functions with no callers, exports never imported, tests for code that no longer exists.",
  },
];
</script>

<template>
  <section class="dx-section">
    <div class="dx-home__shell">
      <div class="dx-section__heading">
        <p class="dx-section__eyebrow">alfred · opt-in LLM</p>
        <h2 class="dx-display">
          Reports that <em>read</em><br />the graph for you.
        </h2>
        <p class="dx-section__lede">
          Alfred is markdown prompt templates over the indexed graph. BYOK,
          local models supported. Off by default. Nothing leaves your machine
          unless you opt in.
        </p>
      </div>

      <div class="dx-grid dx-grid--2">
        <article v-for="r in reports" :key="r.name" class="dx-card">
          <h3 class="dx-card__title">{{ r.name }}</h3>
          <p class="dx-card__sub">{{ r.sub }}</p>
          <p class="dx-card__body">{{ r.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
