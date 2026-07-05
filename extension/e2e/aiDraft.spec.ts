import { test, expect, type BrowserContext, type Worker } from "@playwright/test";
import { createServer, type Server } from "node:http";
import {
  BASE,
  draftFieldViaExtension,
  fillViaExtension,
  launchExtension,
  seedLocalStorage,
} from "./helpers";

/**
 * AI-draft flow against a stubbed backend (M5): popup button -> content
 * script's draftField() -> background's REQUEST_AI_ANSWER -> BackendClient ->
 * POST {backendUrl}/ai/answer -> written into the field for review.
 *
 * No dockerized backend here (that's extension/integration/*, hitting a real
 * container) — instead a tiny stub HTTP server (same bare node:http style as
 * e2e/server.mjs) started for just this spec, returning a fixed AnswerResponse.
 *
 * Requires `npm run build` first, same as autofill.spec.ts.
 */

const STUB_PORT = Number(process.env.E2E_AI_STUB_PORT ?? 5567);
const STUB_ANSWER = "Drafted answer: I led a cross-functional migration end to end.";

let context: BrowserContext;
let worker: Worker;
let stubServer: Server;

test.beforeAll(async () => {
  ({ context, worker } = await launchExtension());

  stubServer = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/ai/answer") {
      const body = JSON.stringify({
        answer: STUB_ANSWER,
        confidence: 0.9,
        model: "stub-model",
        category: "BEHAVIORAL",
        retrieved: [],
        stubbed: false,
      });
      res.writeHead(200, { "content-type": "application/json" }).end(body);
      return;
    }
    res.writeHead(404).end("not found");
  });
  await new Promise<void>((resolve) => stubServer.listen(STUB_PORT, resolve));
});

test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
});

test.beforeEach(async () => {
  // Clear the M5 answer cache (storage/answerCache.ts) so each test's
  // REQUEST_AI_ANSWER actually reaches the (stubbed or unreachable) backend
  // instead of getting a cache hit from a prior test's identical question.
  await worker.evaluate(async () => {
    await chrome.storage.local.remove("answerCache");
  });
  await seedLocalStorage(worker, {
    userProfile: {
      personal: {},
      links: {},
      workAuth: {},
      experience: [],
      education: [],
      skills: {},
      preferences: {},
      meta: {},
    },
    backendUrl: `http://localhost:${STUB_PORT}`,
  });
});

test("drafts an AI answer into a free-text field via the stubbed backend", async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/ai-draft.html`);
  await page.waitForTimeout(300);

  // FILL_FORM must run first — it populates lastHandles, which AI_DRAFT_FIELD
  // looks up by fieldId. The Cover Letter field is free-text (AI-generate),
  // so it's correctly left blank by the deterministic pass.
  const { result } = await fillViaExtension(worker);
  expect(await page.inputValue("#cl")).toBe("");

  const clMatch = result.matches.find((m) => m.label.includes("Cover Letter"));
  expect(clMatch).toBeTruthy();

  const draft = await draftFieldViaExtension(worker, clMatch!.fieldId);
  expect(draft.ok).toBe(true);
  expect(draft.value).toBe(STUB_ANSWER);

  expect(await page.inputValue("#cl")).toBe(STUB_ANSWER);

  await page.close();
});

test("surfaces a clear error when the backend is unreachable", async () => {
  await seedLocalStorage(worker, { backendUrl: "http://localhost:1" }); // nothing listens here

  const page = await context.newPage();
  await page.goto(`${BASE}/ai-draft.html`);
  await page.waitForTimeout(300);

  const { result } = await fillViaExtension(worker);
  const clMatch = result.matches.find((m) => m.label.includes("Cover Letter"));

  const draft = await draftFieldViaExtension(worker, clMatch!.fieldId);
  expect(draft.ok).toBe(false);
  expect(await page.inputValue("#cl")).toBe("");

  await page.close();
});
