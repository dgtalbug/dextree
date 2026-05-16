import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
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
    ],
  },
});
