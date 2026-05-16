import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "webview",
    include: ["src/webview/**/*.test.tsx"],
    environment: "jsdom",
    globals: false,
    root: import.meta.dirname,
  },
});
