<!--
  Footer — minimal. License + the four most-pointed-at links.
-->
<script setup lang="ts">
const year = new Date().getFullYear();
const links = [
  { href: "/guide/", text: "Guide" },
  { href: "/reference/commands", text: "Reference" },
  { href: "/blog/", text: "Blog" },
  { href: "https://github.com/dgtalbug/dextree", text: "GitHub" },
];
</script>

<template>
  <footer class="dx-footer">
    <div class="dx-home__shell dx-footer__row">
      <span>MIT © {{ year }} @dgtalbug</span>
      <ul class="dx-footer__links">
        <li v-for="link in links" :key="link.href">
          <a :href="link.href" class="dx-footer__link">{{ link.text }}</a>
        </li>
      </ul>
    </div>
  </footer>
</template>
