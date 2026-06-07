import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: [
      ".idea/**",
      ".vscode/**",
      "build/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "**/*.min.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.mts", "**/*.cts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        acquireVsCodeApi: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Non-component webview modules are `.ts` but run in the browser, so they
    // need DOM globals (HTMLCanvasElement, etc.) like their `.tsx` siblings —
    // unlike core/extension-host `.ts`, which stay Node-only above.
    files: ["packages/extension/src/webview/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        acquireVsCodeApi: "readonly",
      },
    },
  },
  {
    // core must run in Node, browser (WASM), and VS Code contexts — it can never
    // depend on the `vscode` host API. Host-specific behaviour is injected via
    // interfaces. Enforces the no-vscode-in-core architecture boundary.
    // (The DuckDB-driver ban lands once storage access moves behind the
    // repository adapter, so it can be scoped to everything but the adapters.)
    files: ["packages/core/src/**/*.ts"],
    ignores: ["**/*.test.ts", "**/__fixtures__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "vscode",
              message:
                "core must not import vscode — it runs in Node/WASM/browser. Inject host behaviour via an interface.",
            },
          ],
        },
      ],
    },
  },
  prettier,
];
