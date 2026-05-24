<!--
  Section: "Spec-driven. Agent-executed."
  Skeleton: brief 3-step description of the spec → plan → tasks → code flow.
-->
<script setup lang="ts">
const steps = [
  {
    step: "1",
    title: "Spec",
    sub: "What & why",
    body: "Every change starts as a spec.md under specs/NNN-<slice>/. No code without scope.",
  },
  {
    step: "2",
    title: "Plan",
    sub: "How",
    body: "A plan.md is generated next to the spec — design, contracts, data model.",
  },
  {
    step: "3",
    title: "Tasks",
    sub: "In what order",
    body: "A tasks.md breaks the plan into ordered, dependency-aware work items.",
  },
  {
    step: "4",
    title: "Code",
    sub: "By any agent",
    body: "An agent (Claude, Copilot, or human) picks up the spec and implements. The spec is the contract.",
  },
];
</script>

<template>
  <section id="spec" class="dx-section">
    <div class="dx-home__shell">
      <div class="dx-section__heading">
        <p class="dx-section__eyebrow">how it's built</p>
        <h2 class="dx-display">
          Spec-driven.<br /><em>Agent-executed.</em>
        </h2>
        <p class="dx-section__lede">
          Dextree is built spec-first. Any agent — Claude, Copilot, or a
          human — can pick up a spec and implement it. The spec is the
          contract; the agent is interchangeable.
        </p>
      </div>

      <div class="dx-grid dx-grid--4">
        <article v-for="item in steps" :key="item.step" class="dx-card dx-step-card">
          <span class="dx-step-card__num">{{ item.step }}</span>
          <h3 class="dx-card__title">{{ item.title }}</h3>
          <p class="dx-card__sub">{{ item.sub }}</p>
          <p class="dx-card__body">{{ item.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dx-step-card {
  padding-top: 36px;
}

.dx-step-card__num {
  position: absolute;
  top: 16px;
  right: 20px;
  font-family: var(--display);
  font-size: 28px;
  font-weight: 700;
  color: var(--amber);
  opacity: 0.5;
}
</style>
