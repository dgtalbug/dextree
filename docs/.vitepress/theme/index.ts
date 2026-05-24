/**
 * Dextree custom theme.
 *
 * Uses VitePress's recommended Layout-override pattern (not the deprecated
 * Theme.setup hook). The Layout function returns a wrapped DefaultTheme.Layout
 * with our slot overrides AND an inline render that mirrors VitePress's
 * isDark → data-theme attribute so the indigo CSS keeps working.
 */
import { h, onMounted, watch, type Component } from "vue";
import { defineClientComponent, useData } from "vitepress";
import DefaultTheme from "vitepress/theme-without-fonts";
import type { Theme } from "vitepress";

// Theme + Vue Flow CSS imports (side-effect)
import "./custom.css";
import "./styles/arch.css";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/controls/dist/style.css";
import "virtual:group-icons.css";

// ArchDiagram uses Vue Flow which touches browser APIs (requestFullscreen,
// useVueFlow with DOM refs) — defer to client only so SSR doesn't crash.
const ArchDiagram = defineClientComponent(() => import("./components/shared/ArchDiagram.vue"));

// IndigoHome renders the verbatim dextree-indigo.html as the home page.
// See components/home/IndigoHome.vue for the strategy. The pre-indigo
// Vue home (HomePage.vue + section SFCs) lives in docs/_archive/ if the
// component-based home ever needs to be revived.
import IndigoHome from "./components/home/IndigoHome.vue";

/**
 * Tiny inline-render component that runs the isDark → data-theme bridge.
 * Mounted inside the Layout's render fn so it lives in the Vue tree and
 * has access to useData() without triggering the deprecated theme.setup.
 */
const ThemeBridge: Component = {
  setup() {
    const { isDark } = useData();
    const sync = (dark: boolean) => {
      const root = document.documentElement;
      root.setAttribute("data-theme", dark ? "dark" : "light");
      // VitePress already toggles `.dark` for its own components, but we
      // double-ensure here so the indigo (data-theme) and doc pages
      // (.dark) never drift apart if one update fires before the other.
      root.classList.toggle("dark", dark);
    };
    onMounted(() => sync(isDark.value));
    watch(isDark, sync);
    return () => null; // renders nothing — it's a side-effect component
  },
};

const theme: Theme = {
  extends: DefaultTheme,

  enhanceApp({ app }) {
    app.component("ArchDiagram", ArchDiagram);
    app.component("IndigoHome", IndigoHome);
  },

  Layout() {
    return h(DefaultTheme.Layout, null, {
      // ThemeBridge mounts at the layout root; renders nothing but keeps
      // the isDark watcher alive for the lifetime of the page.
      "layout-top": () => h(ThemeBridge),
    });
  },
};

export default theme;
