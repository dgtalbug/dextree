import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from "vitepress-plugin-group-icons";
import llmstxt from "vitepress-plugin-llms";
import { GitChangelog } from "@nolebase/vitepress-plugin-git-changelog/vite";

const REPO_URL = "https://github.com/dgtalbug/dextree";

// Inline script that runs BEFORE any CSS to set data-theme on <html>, preventing
// a flash of unstyled / wrong-theme content on first paint. The watcher in
// theme/index.ts then keeps data-theme in lock-step with VitePress's isDark.
const themePrePaintScript = `
(function() {
  try {
    var saved = localStorage.getItem('vitepress-theme-appearance') || 'auto';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = saved === 'dark' || (saved !== 'light' && prefersDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (isDark) document.documentElement.classList.add('dark');
  } catch (e) {
    // localStorage blocked (private browsing); fall back to dark default
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default withMermaid(
  defineConfig({
    title: "Dextree",
    description:
      "Index your codebase into a navigable semantic graph — inside VS Code.",
    lang: "en-US",

    // Env-driven base — local dev gets "/", GitHub Pages CI sets DOCS_BASE.
    base: process.env.DOCS_BASE || "/",
    // No srcDir — we invoke `vitepress build docs`, so docs/ is already the
    // project root. Setting srcDir: 'docs' here would resolve to docs/docs/.

    // Exclude meta-docs and HTML drafts from VitePress content tree.
    srcExclude: [
      "_archive/**",
      "README.md",
      "BADGES.md",
      "dextree-indigo.html",
      "dextree-matrix.html",
    ],

    cleanUrls: true,
    lastUpdated: true,
    ignoreDeadLinks: false,

    head: [
      ["script", {}, themePrePaintScript],
      // Webfonts the indigo HTML expects: Fraunces (display, variable
      // 9..144 / 300..900), JetBrains Mono (mono), Inter (body).
      // preconnect first for the cross-origin handshake; stylesheet second.
      [
        "link",
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
      ],
      [
        "link",
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: "",
        },
      ],
      [
        "link",
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap",
        },
      ],
      // favicon and OG image to be added later (see docs/README.md)
    ],

    themeConfig: {
      nav: [
        { text: "Home", link: "/" },
        { text: "Guide", link: "/guide/" },
        { text: "Reference", link: "/reference/commands" },
        { text: "Blog", link: "/blog/" },
        // GitHub is reachable via the social icon next to the theme toggle —
        // duplicating it in the menu was visual noise.
      ],

      sidebar: {
        "/guide/": [
          {
            text: "Getting started",
            collapsed: false,
            items: [
              { text: "What is Dextree", link: "/guide/" },
              { text: "Installation", link: "/guide/installation" },
            ],
          },
          {
            text: "Concepts",
            collapsed: false,
            items: [
              {
                text: "Two-pass indexing",
                link: "/guide/concepts/two-pass-indexing",
              },
              { text: "Shared graph", link: "/guide/concepts/shared-graph" },
              {
                text: "VS Code data fusion",
                link: "/guide/concepts/vs-code-fusion",
              },
            ],
          },
        ],
        "/reference/": [
          {
            text: "Reference",
            collapsed: false,
            items: [
              { text: "Commands", link: "/reference/commands" },
              { text: "Configuration", link: "/reference/configuration" },
            ],
          },
        ],
        "/blog/": [
          {
            text: "Blog",
            collapsed: false,
            items: [{ text: "All posts", link: "/blog/" }],
          },
        ],
      },

      socialLinks: [{ icon: "github", link: REPO_URL }],

      editLink: {
        pattern: `${REPO_URL}/edit/main/docs/:path`,
        text: "Edit this page on GitHub",
      },

      lastUpdated: {
        text: "Last updated",
        formatOptions: { dateStyle: "medium", timeStyle: "short" },
      },

      search: { provider: "local" },

      outline: { level: [2, 3] },
    },

    markdown: {
      lineNumbers: false,
      config(md) {
        md.use(groupIconMdPlugin);
      },
    },

    vite: {
      plugins: [
        groupIconVitePlugin(),
        // generates llms.txt + llms-full.txt at build time
        llmstxt(),
        GitChangelog({ repoURL: REPO_URL }),
      ],
      optimizeDeps: {
        // nolebase client entries need exclusion to work in dev mode
        exclude: [
          "@nolebase/vitepress-plugin-breadcrumbs/client",
          "@nolebase/vitepress-plugin-git-changelog/client",
        ],
      },
      resolve: {
        // git-changelog uses dayjs; alias to ESM build to keep Vite happy
        alias: {
          "dayjs/dayjs.min.js": "dayjs/esm/index.js",
        },
      },
      ssr: {
        // these packages publish CJS bundles that Vite's SSR can't externalize
        noExternal: [
          "@nolebase/vitepress-plugin-breadcrumbs",
          "@nolebase/vitepress-plugin-git-changelog",
          "@vue-flow/core",
          "@vue-flow/background",
          "@vue-flow/controls",
          "@vue-flow/minimap",
        ],
      },
    },
  }),
);
