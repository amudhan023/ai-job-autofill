import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts so the web-extension plugin doesn't run in tests.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/test/**",
        "src/**/main.tsx",
        "src/**/*.d.ts",
      ],
    },
  },
});
