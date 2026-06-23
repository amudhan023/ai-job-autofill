import { defineConfig } from "@playwright/test";

/**
 * E2E config. Tests load the BUILT extension (dist/) into a persistent Chromium
 * context and drive static fixture ATS pages served from e2e/fixtures.
 * Run `npm run build` before `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // extension contexts are heavyweight; keep serial
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  use: {
    trace: "on-first-retry",
  },
  webServer: {
    command: "node e2e/server.mjs",
    url: `http://localhost:${process.env.E2E_PORT ?? 5566}`,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
