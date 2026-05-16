import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "core",
      include: ["packages/core/src/**/*.test.ts"],
      environment: "node",
      globals: false,
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"]
      }
    }
  },
  {
    test: {
      name: "extension",
      include: ["packages/extension/src/**/*.test.ts"],
      environment: "node",
      globals: false,
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"]
      }
    }
  }
]);