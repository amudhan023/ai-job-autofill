import { test, expect, type BrowserContext, type Worker } from "@playwright/test";
import { BASE, fillViaExtension, launchExtension, seedLocalStorage } from "./helpers";

/**
 * Multi-page fill session auto-continue (M4): a manual fill on step 1 starts
 * a session; navigating to step 2 (a real page load, same origin + first
 * path segment "wizard") should auto-continue the fill via
 * resumeSessionOnLoad() — no second manual trigger.
 *
 * Requires `npm run build` first, same as autofill.spec.ts.
 */

const SEED_PROFILE = {
  personal: {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "+1-555-0199",
  },
  links: { linkedin: "", github: "", portfolio: "", website: "" },
  workAuth: { usAuthorized: true, sponsorshipNeeded: false },
  experience: [],
  education: [],
  skills: { technical: [], languages: [], certifications: [] },
  preferences: {},
  meta: { totalYearsExp: 5 },
};

let context: BrowserContext;
let worker: Worker;

test.beforeAll(async () => {
  ({ context, worker } = await launchExtension());
});

test.afterAll(async () => {
  await context?.close();
});

test.beforeEach(async () => {
  await seedLocalStorage(worker, { userProfile: SEED_PROFILE });
});

test("auto-continues a fill session across a wizard's page navigation", async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/wizard/step1.html`);
  await page.waitForTimeout(300);

  // Manual fill on step 1 starts the session (recordFill runs regardless of
  // auto/manual).
  const step1 = await fillViaExtension(worker);
  expect(step1.result.filledCount).toBeGreaterThanOrEqual(2);
  expect(await page.inputValue("#fn")).toBe("Ada");
  expect(await page.inputValue("#ln")).toBe("Lovelace");

  // Real navigation to step 2 — a fresh content-script injection, whose
  // resumeSessionOnLoad() should auto-fill without any further FILL_FORM call.
  await page.goto(`${BASE}/wizard/step2.html`);
  await page.waitForTimeout(2000);

  expect(await page.inputValue("#em")).toBe("ada@example.com");
  expect(await page.inputValue("#ph")).toBe("+1-555-0199");

  await page.close();
});

test("does not auto-continue into an unrelated origin/path scope", async () => {
  // A fresh session-free page load (different first path segment) must not
  // auto-fill — canAutoFill() requires an existing, fresh session for THIS
  // scope, and none exists here.
  const page = await context.newPage();
  await page.goto(`${BASE}/greenhouse.html`);
  await page.waitForTimeout(2000);

  expect(await page.inputValue("#fn")).toBe("");
  expect(await page.inputValue("#ln")).toBe("");

  await page.close();
});
