<!--
  Section: "Where we win. Where we don't."
  Skeleton: honest comparison block — what Dextree is good at, what it
  isn't trying to be.
-->
<script setup lang="ts">
const wins = [
  "Inside-editor: live diagnostics, blame, test discovery — fused into the graph",
  "Embedded DuckDB: zero servers, zero daemons, one file",
  "Blast-radius UX: see what could break, not just what changed",
  "Markdown-driven Alfred prompts: portable, auditable, BYOK",
  "MCP-ready: Claude/Cursor/Copilot read structure, not summaries",
];

const losses = [
  "Cross-repo: single workspace only; multi-repo monorepos partially supported",
  "Real-time collaboration: graph is local; no shared session yet",
  "Code search at Sourcegraph scale: this is a graph tool, not a search engine",
  "Auto-fix: we surface problems; we don't refactor for you",
  "Java/Kotlin/C#: Tree-sitter grammars not yet integrated",
];
</script>

<template>
  <section class="dx-section">
    <div class="dx-home__shell">
      <div class="dx-section__heading">
        <p class="dx-section__eyebrow">honest positioning</p>
        <h2 class="dx-display">Where we <em>win</em>.<br />Where we don't.</h2>
      </div>

      <div class="dx-grid dx-grid--2">
        <article class="dx-card dx-where dx-where--win">
          <h3 class="dx-card__title">Where we win</h3>
          <ul class="dx-where__list">
            <li v-for="item in wins" :key="item">{{ item }}</li>
          </ul>
        </article>

        <article class="dx-card dx-where dx-where--lose">
          <h3 class="dx-card__title">Where we don't</h3>
          <ul class="dx-where__list">
            <li v-for="item in losses" :key="item">{{ item }}</li>
          </ul>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dx-where--win {
  border-left: 3px solid var(--ok);
}

.dx-where--lose {
  border-left: 3px solid var(--ink-faint);
}

.dx-where__list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--ink-warm);
}

.dx-where__list li {
  position: relative;
  padding: 6px 0 6px 22px;
  border-bottom: 1px solid var(--line);
}

.dx-where__list li:last-child {
  border-bottom: 0;
}

.dx-where--win .dx-where__list li::before {
  content: "✓";
  position: absolute;
  left: 0;
  color: var(--ok);
  font-weight: 700;
}

.dx-where--lose .dx-where__list li::before {
  content: "×";
  position: absolute;
  left: 0;
  color: var(--ink-faint);
  font-weight: 700;
}
</style>
