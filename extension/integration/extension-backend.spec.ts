import { test, expect, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Browser-level integration: the REAL built extension talks to the LIVE backend
 * container from its service worker. This is the path that the CORS bug broke —
 * an extension-origin (`chrome-extension://<id>`) POST with a JSON body triggers
 * a CORS preflight that the backend must allow. If CORS is misconfigured the
 * fetch throws "Failed to fetch"; these tests assert it succeeds.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_PATH = join(__dirname, "..", "dist");
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

let context: BrowserContext;
let worker: Worker;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext("", {
    headless: true,
    channel: "chromium",
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      // Required when running Chromium inside the integration container.
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
});

test.afterAll(async () => {
  await context?.close();
});

test("service worker can reach the backend across origins (CORS preflight ok)", async () => {
  const result = await worker.evaluate(async (backend) => {
    try {
      const res = await fetch(`${backend}/ai/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: "Describe a time you led a team through change",
          jd_summary: "Staff Engineer",
          experience: [{ company: "Acme", title: "Staff Engineer", bullets: ["Led a migration"] }],
        }),
      });
      return { ok: res.ok, status: res.status, body: await res.json() };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, BACKEND);

  expect(result.ok, `fetch failed: ${result.error ?? ""}`).toBe(true);
  expect(result.body.category).toBe("BEHAVIORAL");
  expect(result.body.answer.length).toBeGreaterThan(0);
});

test("backend client request shape matches the live API (classify)", async () => {
  const result = await worker.evaluate(async (backend) => {
    const res = await fetch(`${backend}/ai/classify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "Why do you want to join us?" }),
    });
    return { ok: res.ok, body: await res.json() };
  }, BACKEND);

  expect(result.ok).toBe(true);
  expect(result.body.category).toBe("MOTIVATION");
});

test("health is reachable from the extension origin", async () => {
  const result = await worker.evaluate(async (backend) => {
    const res = await fetch(`${backend}/health`);
    return { ok: res.ok, body: await res.json() };
  }, BACKEND);
  expect(result.ok).toBe(true);
  expect(result.body.ai_enabled).toBe(true);
});
