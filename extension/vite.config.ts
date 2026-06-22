import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  plugins: [
    react(),
    webExtension({
      manifest: resolve(__dirname, "src/manifest.json"),
      watchFilePaths: [resolve(__dirname, "src/manifest.json")],
    }),
  ],
});
