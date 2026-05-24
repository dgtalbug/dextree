<!--
  Section: "Specs run local. Or specs run in CI."
  Skeleton: shows the two modes — local SpecKit / CI agent dispatch.
-->
<script setup lang="ts">
const modes = [
  {
    eyebrow: "Local",
    title: "SpecKit on your laptop",
    body: "Spec, plan, tasks generate next to each other in specs/NNN-<slice>/. Any agent picks it up.",
    code: [
      "$ /specify   # author spec.md",
      "$ /plan      # generate plan.md",
      "$ /tasks     # generate tasks.md",
      "$ /implement # dispatch agent",
    ],
  },
  {
    eyebrow: "Remote",
    title: "CI-dispatched agents",
    body: "Comment @claude implement this or @copilot implement this on an issue. The spec is the contract; the agent opens a draft PR.",
    code: [
      "issue: feat(extension): add S14 — export summary",
      "tag:   spec → specs/014-export-summary/",
      "comment: @claude implement this",
      "→ draft PR opened in ~6 min",
    ],
  },
];
</script>

<template>
  <section id="roadmap" class="dx-section">
    <div class="dx-home__shell">
      <div class="dx-section__heading">
        <p class="dx-section__eyebrow">workflow</p>
        <h2 class="dx-display">
          Specs run <em>local</em>.<br />Or specs run in <em>CI</em>.
        </h2>
        <p class="dx-section__lede">
          The same spec works either way. Authoring is one tool; execution is
          a choice.
        </p>
      </div>

      <div class="dx-grid dx-grid--2">
        <article v-for="mode in modes" :key="mode.eyebrow" class="dx-card">
          <p class="dx-card__sub">{{ mode.eyebrow }}</p>
          <h3 class="dx-card__title">{{ mode.title }}</h3>
          <p class="dx-card__body">{{ mode.body }}</p>
          <pre class="dx-specs-run__code">{{ mode.code.join("\n") }}</pre>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dx-specs-run__code {
  margin: 16px 0 0;
  padding: 14px 16px;
  background: var(--bg-3);
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-mute);
  overflow-x: auto;
  white-space: pre;
}
</style>
