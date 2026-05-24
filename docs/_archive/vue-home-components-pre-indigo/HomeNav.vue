<!--
  Floating pill nav for the home page. Fixed top-center, glass blur,
  hash-anchor links into the page sections, "Star on GitHub" CTA.

  In a future enrichment pass we can add intersection-observer-driven
  active-section highlighting on the nav links.
-->
<script setup lang="ts">
import { computed } from "vue";
import { useData } from "vitepress";

const { isDark } = useData();

const REPO_URL = "https://github.com/dgtalbug/dextree";

const links = [
  { id: "value", label: "Why" },
  { id: "how", label: "How" },
  { id: "playground", label: "Ask" },
  { id: "spec", label: "Spec" },
  { id: "roadmap", label: "Roadmap" },
];

function toggleTheme() {
  isDark.value = !isDark.value;
}

const themeLabel = computed(() =>
  isDark.value ? "Switch to light theme" : "Switch to dark theme",
);
</script>

<template>
  <nav class="dx-nav" aria-label="Site navigation">
    <a class="dx-nav__brand" href="#top">
      <span class="dx-nav__brand-mark" aria-hidden="true">
        <!-- Simple geometric mark; replace with a real logo later -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <circle cx="5" cy="6" r="2" />
          <circle cx="19" cy="6" r="2" />
          <circle cx="5" cy="18" r="2" />
          <circle cx="19" cy="18" r="2" />
          <path d="M12 12L5 6M12 12L19 6M12 12L5 18M12 12L19 18" />
        </svg>
      </span>
      <span>dextree</span>
    </a>

    <ul class="dx-nav__links" role="list">
      <li v-for="link in links" :key="link.id">
        <a class="dx-nav__link" :href="`#${link.id}`">{{ link.label }}</a>
      </li>
    </ul>

    <div class="dx-nav__right">
      <button
        type="button"
        class="dx-nav__icon-btn"
        :aria-label="themeLabel"
        :title="themeLabel"
        @click="toggleTheme"
      >
        <svg v-if="isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <!-- Sun (currently dark, click → light) -->
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <!-- Moon (currently light, click → dark) -->
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>

      <a
        class="dx-nav__cta"
        :href="REPO_URL"
        target="_blank"
        rel="noopener"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .11-.78.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
        </svg>
        Star
      </a>
    </div>
  </nav>
</template>
