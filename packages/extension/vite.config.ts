import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: {
    // framer-motion and other packages reference process.env.NODE_ENV.
    // process is a Node.js global not available in the webview browser context,
    // so we replace it at build time.
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: resolve(packageDir, "src/webview/main.tsx"),
      name: "DextreeWebview",
      formats: ["iife"],
      fileName: () => "webview.js",
    },
    outDir: resolve(packageDir, "dist/webview"),
    rollupOptions: {
      external: ["vscode"],
    },
    sourcemap: true,
    minify: false,
  },
});
