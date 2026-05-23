import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
    projects: [
      {
        test: {
          name: "core",
          include: ["packages/core/src/**/*.test.ts"],
          environment: "node",
          globals: false,
        },
      },
      {
        test: {
          name: "extension",
          include: ["packages/extension/src/**/*.test.ts"],
          environment: "node",
          globals: false,
        },
      },
      "packages/extension/vitest.webview.config.ts",
    ],
  },
});
