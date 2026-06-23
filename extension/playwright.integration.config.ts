import { defineConfig } from "@playwright/test";

/**
 * Integration E2E config. Unlike playwright.config.ts (which tests the extension
 * in isolation against static fixtures), this drives the extension AND a live
 * backend together — validating the real cross-process contract:
 *   extension service worker  ──HTTP──▶  FastAPI backend (containerized)
 *
 * The backend base URL comes from BACKEND_URL (http://backend:8000 in compose,
 * http://localhost:8000 on the host). A fixtures server is started for the ATS
 * page used by the autofill+AI flow.
 */
export default defineConfig({
  testDir: "./integration",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: process.env.BACKEND_URL ?? "http://localhost:8000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node e2e/server.mjs",
    url: `http://localhost:${process.env.E2E_PORT ?? 5566}`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
