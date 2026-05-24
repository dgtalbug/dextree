<!--
  Section: "Things that are broken right now."
  Skeleton: honest list of current gaps + workarounds. This is the
  "we know" section — credibility through transparency.
-->
<script setup lang="ts">
const gaps = [
  {
    title: "Marketplace install",
    sub: "blocking",
    body: "Not on the VS Code Marketplace yet. Build from source via pnpm package and install the .vsix manually.",
  },
  {
    title: "Languages",
    sub: "partial",
    body: "TypeScript, JavaScript, Python, Markdown only. Tree-sitter grammars for Go, Rust, Java in the pipeline.",
  },
  {
    title: "Webview perf",
    sub: "needs work",
    body: "Repos over ~5,000 symbols show a 'filter first' screen instead of rendering. Sigma.js tuning is ongoing.",
  },
  {
    title: "Blast radius",
    sub: "v0.2",
    body: "Not implemented in v0.1. The graph supports it; the analysis command is the next major slice.",
  },
];
</script>

<template>
  <section class="dx-section">
    <div class="dx-home__shell">
      <div class="dx-section__heading">
        <p class="dx-section__eyebrow">honest gaps</p>
        <h2 class="dx-display">
          Things that are<br /><em>broken</em> right now.
        </h2>
        <p class="dx-section__lede">
          Pre-alpha means real gaps. We'd rather list them than hide them.
        </p>
      </div>

      <div class="dx-grid dx-grid--2">
        <article v-for="gap in gaps" :key="gap.title" class="dx-card">
          <h3 class="dx-card__title">{{ gap.title }}</h3>
          <p class="dx-card__sub">{{ gap.sub }}</p>
          <p class="dx-card__body">{{ gap.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
