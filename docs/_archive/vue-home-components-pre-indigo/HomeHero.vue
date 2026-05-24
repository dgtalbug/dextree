<!--
  Hero — top of the home page.

  Matches the indigo HTML hero pixel-for-pixel:
    - Animated background orbs (amber top-right, cyan bottom-left)
    - Hero meta chips (live · MIT · spec-driven warn)
    - Display H1 with per-word staggered rise animation
    - Lede paragraph with rise-in
    - Primary (shimmer + amber-on-hover) + ghost (amber-border on hover) CTAs
    - Trust row with three monospace items
    - HeroGraph (lazy-loaded) on the right
-->
<script setup lang="ts">
import { defineClientComponent } from "vitepress";

const HeroGraph = defineClientComponent(() => import("./HeroGraph.vue"));

const REPO_URL = "https://github.com/dgtalbug/dextree";
</script>

<template>
  <section id="top" class="dx-hero">
    <div class="dx-hero__bg" aria-hidden="true">
      <div class="dx-hero__bg-grid" />
      <div class="dx-hero__bg-orb a" />
      <div class="dx-hero__bg-orb b" />
    </div>

    <div class="dx-home__shell dx-hero__inner">
      <div class="dx-hero__left">
        <div class="dx-hero__chips">
          <span class="dx-chip dx-chip--live">pre-alpha · v0.1 in progress</span>
          <span class="dx-chip">MIT · open source</span>
          <span class="dx-chip dx-chip--warn">spec-driven · agent-executed</span>
        </div>

        <h1 class="dx-hero__h1">
          <span class="dx-hero__word">Your</span>
          <span class="dx-hero__word">codebase,</span>
          <br />
          <span class="dx-hero__word"><em>finally</em></span>
          <span class="dx-hero__word"><em>legible.</em></span>
        </h1>

        <p class="dx-hero__lede">
          Dextree turns your repository into a
          <strong>navigable semantic graph</strong> — inside VS Code. Click a
          function, see its callers. Open a PR, see what could break. Ask the
          graph the questions a README can't answer.
        </p>

        <div class="dx-hero__ctas">
          <a
            class="dx-btn dx-btn--primary"
            :href="REPO_URL"
            target="_blank"
            rel="noopener"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .11-.78.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Star on GitHub
            <span class="dx-btn__arrow">→</span>
          </a>
          <a class="dx-btn dx-btn--ghost" href="#value">See what you get</a>
        </div>

        <div class="dx-hero__trust">
          <span class="dx-hero__trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12l3 3 5-6" />
            </svg>
            DuckDB + DuckPGQ embedded
          </span>
          <span class="dx-hero__trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M3 12h4l3-9 4 18 3-9h4" />
            </svg>
            graph in &lt; 1s
          </span>
          <span class="dx-hero__trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            nothing leaves your machine by default
          </span>
        </div>
      </div>

      <div class="dx-hero__right">
        <HeroGraph />
      </div>
    </div>
  </section>
</template>
