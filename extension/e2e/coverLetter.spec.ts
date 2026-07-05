import { test, expect, type BrowserContext, type Worker } from "@playwright/test";
import { createServer, type Server } from "node:http";
import {
  BASE,
  draftCoverLetterViaExtension,
  fillViaExtension,
  launchExtension,
  seedLocalStorage,
} from "./helpers";

/**
 * Cover-letter generation flow (T7): popup's CoverLetterButton -> content
 * script's draftCoverLetter() -> background's REQUEST_COVER_LETTER ->
 * BackendClient -> POST {backendUrl}/ai/cover-letter -> written into the
 * field for review. Distinct end-to-end path from aiDraft.spec.ts's generic
 * AI_DRAFT_FIELD flow — this one carries a company name and a tone.
 *
 * Same stub-server approach as aiDraft.spec.ts (no dockerized backend here).
 * Requires `npm run build` first, same as autofill.spec.ts.
 */

const STUB_PORT = Number(process.env.E2E_COVER_LETTER_STUB_PORT ?? 5568);
const STUB_LETTER = "Dear Acme, I'm excited to apply for this role...";

let context: BrowserContext;
let worker: Worker;
let stubServer: Server;
let lastRequestBody: unknown;

test.beforeAll(async () => {
  ({ context, worker } = await launchExtension());

  stubServer = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/ai/cover-letter") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        lastRequestBody = JSON.parse(raw);
        const body = JSON.stringify({
          letter: STUB_LETTER,
          model: "stub-model",
          style: (lastRequestBody as { style?: string }).style ?? "formal",
          stubbed: false,
        });
        res.writeHead(200, { "content-type": "application/json" }).end(body);
      });
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

test("generates a tailored cover letter into the field via the stubbed backend, sending company + style", async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/ai-draft.html`);
  await page.waitForTimeout(300);

  const { result } = await fillViaExtension(worker);
  expect(await page.inputValue("#cl")).toBe("");

  const clMatch = result.matches.find((m) => m.label.includes("Cover Letter"));
  expect(clMatch).toBeTruthy();

  const draft = await draftCoverLetterViaExtension(worker, clMatch!.fieldId, "Acme", "startup");
  expect(draft.ok).toBe(true);
  expect(draft.value).toBe(STUB_LETTER);
  expect(lastRequestBody).toMatchObject({ company: "Acme", style: "startup" });

  expect(await page.inputValue("#cl")).toBe(STUB_LETTER);

  await page.close();
});

test("surfaces a clear error when the backend is unreachable", async () => {
  await seedLocalStorage(worker, { backendUrl: "http://localhost:1" }); // nothing listens here

  const page = await context.newPage();
  await page.goto(`${BASE}/ai-draft.html`);
  await page.waitForTimeout(300);

  const { result } = await fillViaExtension(worker);
  const clMatch = result.matches.find((m) => m.label.includes("Cover Letter"));

  const draft = await draftCoverLetterViaExtension(worker, clMatch!.fieldId, "Acme");
  expect(draft.ok).toBe(false);
  expect(await page.inputValue("#cl")).toBe("");

  await page.close();
});
