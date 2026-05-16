import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    projects: [
      defineProject({
        test: {
          name: "core",
          include: ["packages/core/src/**/*.test.ts"],
          environment: "node",
          globals: false,
        },
      }),
      defineProject({
        test: {
          name: "extension",
          include: ["packages/extension/src/**/*.test.ts"],
          environment: "node",
          globals: false,
        },
      }),
    ],
  },
});
