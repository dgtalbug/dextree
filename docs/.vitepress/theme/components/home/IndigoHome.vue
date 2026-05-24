<!--
  IndigoHome — renders the verbatim docs/dextree-indigo.html design as the
  home page at `/`. The indigo HTML stays untouched as the source of truth;
  this component is a thin layout that imports it via Vite's `?raw`, parses
  out body + styles + scripts, and reattaches them in the correct order.

  Why this exists:
    - The indigo HTML is a 5K-line hand-crafted design with 15 inline style
      blocks, 4 IIFE scripts (hero graph builder, pass toggle, playground,
      console tracker), and very particular animation choreography. Porting
      it to 15 individual Vue SFCs (the components/home/ folder) didn't
      preserve the look. Render-as-HTML preserves it exactly.
    - Future edits live in dextree-indigo.html. This file is the loader,
      not the content.

  How it works (5 steps):
    1. Import indigo HTML as a string at build time (Vite `?raw`).
    2. Parse once via DOMParser (client) or regex fallback (server).
    3. SSR ships the body inner-HTML so curl / search engines see content.
    4. On mount, inject the indigo <style> blocks into <head> (idempotent).
    5. On mount, run the indigo <script> blocks once per mount cycle.

  Theme sync:
    - VitePress's isDark already mirrors to data-theme via ThemeBridge.
    - The indigo's own #theme-toggle is intercepted at capture phase
      after-mount, so clicking it ALSO flips VitePress isDark.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useData } from "vitepress";

// Vite imports the file as a string at build time. The string never appears
// in user input — it's content we author in the same repo — so v-html and
// new Function() are both content-trusted.
// Path: home/ → components/ → theme/ → .vitepress/ → docs/  (4 levels up)
import indigoSource from "../../../../dextree-indigo.html?raw";

// ─── parse once (cheap; static input) ─────────────────────────
interface ParsedIndigo {
  bodyHtml: string;
  styles: string[];
  scripts: string[];
}

function parseIndigo(html: string): ParsedIndigo {
  // Use DOMParser on the client for robustness; regex fallback on server.
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const bodyHtml = doc.body.innerHTML;
    // ONLY extract <head> <style> blocks. The 14 body-level <style> blocks
    // ride along inside bodyHtml via v-html and apply naturally; extracting
    // them again would cause duplicate animations to play out of sync.
    const styles = [...doc.head.querySelectorAll("style")]
      .map((el) => el.textContent ?? "")
      .filter(Boolean);
    // ONLY extract <body> <script> blocks. Script tags rendered via v-html
    // are inert (HTML5 spec); we have to re-execute them ourselves. Head
    // scripts (pre-paint theme setup) are already handled by VitePress's
    // own theme bridge, so we skip them.
    const scripts = [...doc.body.querySelectorAll("script")]
      .filter((el) => !el.src) // skip external scripts (none expected)
      .map((el) => el.textContent ?? "")
      .filter(Boolean);
    return { bodyHtml, styles, scripts };
  }

  // SSR fallback — extract just the body inner HTML.
  // Style and script extraction is skipped on the server; they apply on
  // the client only anyway, so the SSR'd output never needs them.
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return {
    bodyHtml: bodyMatch ? bodyMatch[1] : "",
    styles: [],
    scripts: [],
  };
}

const parsed = parseIndigo(indigoSource);

// ─── style injection ──────────────────────────────────────────
// We append each <style> block to <head> with a marker attribute so we
// can find and remove them on unmount or hot-reload re-invocation.
const STYLE_MARKER = "data-indigo-style";

function injectStyles(styleBlocks: string[]): HTMLStyleElement[] {
  const created: HTMLStyleElement[] = [];
  for (const css of styleBlocks) {
    const el = document.createElement("style");
    el.setAttribute(STYLE_MARKER, "");
    el.textContent = css;
    document.head.appendChild(el);
    created.push(el);
  }
  return created;
}

function removeStyles(styleEls: HTMLStyleElement[]): void {
  for (const el of styleEls) {
    el.remove();
  }
  // Also clean any orphans from prior mounts (HMR safety net).
  document
    .querySelectorAll<HTMLStyleElement>(`style[${STYLE_MARKER}]`)
    .forEach((el) => el.remove());
}

// ─── script execution ─────────────────────────────────────────
// Each <script> block is wrapped in `new Function()` so it runs in its
// own scope (not global eval). Scripts run after the body markup is in
// the DOM so $("#hero-edges") etc. find their targets.
function runScripts(scriptBlocks: string[]): void {
  for (const script of scriptBlocks) {
    try {
      // The Function constructor creates a function with the script body;
      // calling it once runs the IIFEs the indigo file defines.
      new Function(script)();
    } catch (err) {
      // Don't let one broken script break the whole page mount.
      console.error("[IndigoHome] script execution error:", err);
    }
  }
}

// ─── theme sync ──────────────────────────────────────────────
// Strategy: VitePress's `isDark` is the single source of truth. We
// intercept the indigo's #theme-toggle click at the CAPTURE phase (which
// fires BEFORE the indigo's own handler) and stop the event from
// propagating, then flip VitePress's isDark directly. That eliminates
// the feedback loop where the indigo handler writes data-theme and our
// watcher writes it back.
//
// VitePress's isDark is a writable computed-like ref — assigning to it
// updates the theme appearance and persists to localStorage automatically.
const { isDark } = useData();
let containerEl = ref<HTMLDivElement | null>(null);

function handleThemeToggleClick(event: Event): void {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  // Match the indigo HTML's button id (or anything inside it like the svg).
  const button = target.closest("#theme-toggle");
  if (!button) return;
  // Take over: prevent the indigo's own click handler from running, then
  // flip VitePress's isDark. The watcher below mirrors it back to
  // data-theme so the indigo CSS sees the change.
  event.preventDefault();
  event.stopImmediatePropagation();
  isDark.value = !isDark.value;
}

// Mirror VitePress's isDark to the indigo's data-theme attribute, AND
// ensure the .dark class stays in sync (VitePress sets it via its own
// watcher but we double-ensure here so the indigo + doc pages never
// drift apart). Single source of truth = VitePress's isDark; we never
// write `dextree-theme` localStorage (that key is only used by the
// indigo's standalone fallback in dextree-indigo.html).
function mirrorVitepressToIndigo(dark: boolean): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.classList.toggle("dark", dark);
}

// ─── lifecycle ───────────────────────────────────────────────
let injectedStyles: HTMLStyleElement[] = [];
const stopThemeWatch = ref<(() => void) | null>(null);

onMounted(() => {
  // 1. Inject indigo styles into <head>.
  injectedStyles = injectStyles(parsed.styles);

  // 2. Mirror VitePress's current isDark to indigo's data-theme on first mount,
  //    in case the user landed here from a doc page that had toggled the theme.
  mirrorVitepressToIndigo(isDark.value);

  // 3. Run indigo scripts after styles are in place + body content is mounted.
  //    The container was rendered SSR (or v-html on client); IIFEs find their
  //    target elements via document.querySelector inside their own scope.
  runScripts(parsed.scripts);

  // 4. Wire up bidirectional theme sync.
  document.addEventListener("click", handleThemeToggleClick, true);
  stopThemeWatch.value = watch(isDark, mirrorVitepressToIndigo);

  // 5. On fresh load with no hash, always show the hero first.
  //    VitePress's router preserves any previous hash across reloads, which
  //    causes the page to scroll mid-document on reload. Hero is the front
  //    door — reset to it unless the user explicitly clicked an anchor link
  //    (which sets a hash that persists in this same navigation).
  if (!window.location.hash) {
    // Defer one frame so VitePress's own scroll restoration doesn't fight us.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    });
  }
});

onBeforeUnmount(() => {
  removeStyles(injectedStyles);
  injectedStyles = [];
  document.removeEventListener("click", handleThemeToggleClick, true);
  if (stopThemeWatch.value) {
    stopThemeWatch.value();
    stopThemeWatch.value = null;
  }
});
</script>

<template>
  <!--
    Single wrapper. v-html drops the indigo body inner HTML in verbatim.
    SSR includes the static markup so crawlers + initial paint see content.
    On client mount, styles + scripts kick in to bring it to life.
  -->
  <div ref="containerEl" class="indigo-home" v-html="parsed.bodyHtml" />
</template>

<!--
  No <style> block in this SFC. All home-page CSS lives in
  theme/styles/home-unwrap.css so it loads via the global stylesheet bundle
  alongside VitePress's own theme styles. Keeps specificity predictable.
-->
