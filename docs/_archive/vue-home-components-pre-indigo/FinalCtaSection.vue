<!--
  Section: "Star it. Watch it. Break it with us."
  Skeleton: final call-to-action. Star/Watch GitHub buttons + bug report link.
-->
<script setup lang="ts">
const REPO_URL = "https://github.com/dgtalbug/dextree";
const ISSUES_URL = `${REPO_URL}/issues/new/choose`;
const WATCH_URL = `${REPO_URL}/subscription`;
</script>

<template>
  <section class="dx-section dx-final-cta">
    <div class="dx-home__shell">
      <div class="dx-section__heading dx-final-cta__heading">
        <h2 class="dx-display">
          Star it. Watch it.<br /><em>Break it with us.</em>
        </h2>
        <p class="dx-section__lede">
          Pre-alpha needs early users more than it needs polish. If something
          breaks, that's the most useful issue we can get.
        </p>
      </div>

      <div class="dx-final-cta__actions">
        <a class="dx-btn dx-btn--primary" :href="REPO_URL" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .587l3.668 7.568L24 9.75l-6 5.847 1.417 8.265L12 19.771l-7.417 4.091L6 15.597 0 9.75l8.332-1.595z" />
          </svg>
          Star on GitHub
        </a>
        <a class="dx-btn dx-btn--ghost" :href="WATCH_URL" target="_blank" rel="noopener">
          Watch the repo
        </a>
        <a class="dx-btn dx-btn--ghost" :href="ISSUES_URL" target="_blank" rel="noopener">
          File an issue
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dx-final-cta {
  text-align: center;
}

.dx-final-cta__heading {
  align-items: center;
  margin-left: auto;
  margin-right: auto;
}

.dx-final-cta__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}
</style>
