<!--
  HomePage.vue — root composer for the Dextree home page.

  Skeleton phase: every section is a thin Vue component with placeholder
  content. Enrichment phases replace placeholder content inside each
  section without touching this composer.
-->
<script setup lang="ts">
import HomeNav from "./HomeNav.vue";
import HomeHero from "./HomeHero.vue";
import ValuePropsSection from "./ValuePropsSection.vue";
import FastFirstSection from "./FastFirstSection.vue";
import AskGraphSection from "./AskGraphSection.vue";
import SpecDrivenSection from "./SpecDrivenSection.vue";
import FourVersionsSection from "./FourVersionsSection.vue";
import ReportsSection from "./ReportsSection.vue";
import ThingsBrokenSection from "./ThingsBrokenSection.vue";
import WhereWeWinSection from "./WhereWeWinSection.vue";
import SpecsRunSection from "./SpecsRunSection.vue";
import FinalCtaSection from "./FinalCtaSection.vue";
import HomeFooter from "./HomeFooter.vue";
</script>

<template>
  <div class="dx-home">
    <HomeNav />
    <HomeHero />
    <ValuePropsSection />
    <FastFirstSection />
    <AskGraphSection />
    <SpecDrivenSection />
    <FourVersionsSection />
    <ReportsSection />
    <ThingsBrokenSection />
    <WhereWeWinSection />
    <SpecsRunSection />
    <FinalCtaSection />
    <HomeFooter />
  </div>
</template>
