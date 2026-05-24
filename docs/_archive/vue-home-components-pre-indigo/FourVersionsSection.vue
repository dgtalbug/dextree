<!--
  Section: "Four versions. One honest ladder."
  Skeleton: the v0.1 → v0.4 release ladder, with status per version.
-->
<script setup lang="ts">
const versions = [
  {
    tag: "v0.1",
    status: "in progress",
    statusTone: "amber",
    title: "Hello, graph.",
    ships: ["Tree-sitter indexing", "DuckDB storage", "Graph view in VS Code", "Mermaid export"],
  },
  {
    tag: "v0.2",
    status: "next",
    statusTone: "cyan",
    title: "What could break?",
    ships: ["LSP enrichment", "Diagnostics overlay", "Git + test fusion", "Blast radius analysis"],
  },
  {
    tag: "v0.3",
    status: "planned",
    statusTone: "neutral",
    title: "Goes everywhere.",
    ships: ["Canvas + PNG + PDF + SVG export", "MCP server", "CLI", "Vite component"],
  },
  {
    tag: "v0.4",
    status: "planned",
    statusTone: "neutral",
    title: "Reads the graph.",
    ships: ["Alfred (opt-in LLM)", "Markdown prompt templates", "BYOK + local models", "Privacy-first"],
  },
];
</script>

<template>
  <section class="dx-section">
    <div class="dx-home__shell">
      <div class="dx-section__heading">
        <p class="dx-section__eyebrow">release ladder</p>
        <h2 class="dx-display">
          Four versions.<br />One <em>honest</em> ladder.
        </h2>
        <p class="dx-section__lede">
          Pre-alpha. Nothing shipped to the Marketplace yet. Here's the
          plan — exactly the order we'll do it in.
        </p>
      </div>

      <div class="dx-grid dx-grid--4">
        <article
          v-for="v in versions"
          :key="v.tag"
          class="dx-card dx-version-card"
        >
          <div class="dx-version-card__head">
            <span class="dx-version-card__tag">{{ v.tag }}</span>
            <span
              class="dx-chip"
              :class="{
                'dx-chip--accent': v.statusTone === 'amber',
              }"
            >
              <span v-if="v.statusTone === 'amber'" class="dx-chip__dot" />
              {{ v.status }}
            </span>
          </div>
          <h3 class="dx-card__title">{{ v.title }}</h3>
          <ul class="dx-version-card__ships">
            <li v-for="ship in v.ships" :key="ship">{{ ship }}</li>
          </ul>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dx-version-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.dx-version-card__tag {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-mute);
}

.dx-version-card__ships {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-warm);
}

.dx-version-card__ships li {
  position: relative;
  padding-left: 16px;
}

.dx-version-card__ships li::before {
  content: "·";
  position: absolute;
  left: 4px;
  color: var(--amber);
  font-weight: 700;
}
</style>
